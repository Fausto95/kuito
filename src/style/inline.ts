import { createHash } from 'node:crypto';
import { Visitor } from 'oxc-parser';
import type {
  BooleanLiteral,
  CallExpression,
  Expression,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  Program,
  PropertyKey,
  Span,
  StringLiteral,
} from 'oxc-parser';
import { render, type Edit } from '../dev/edits.ts';
import { parseModule, type ParsedModule } from '../dev/parse.ts';
import { KINDS, PROPS } from '../protocol/manifest.ts';
import { expandStyle, isStyleProperty, styleNatives, StyleValueError } from './properties.ts';
import type { NativeProps, StyleInput } from './properties.ts';
import { isPlatform, type Platform } from './stylesheet.ts';
import { parseMedia, type Media } from './media.ts';
import { systemSources } from './system-sources.ts';

/** A style's props under an `@media` query, as stylesheets compile them. */
interface Alternate {
  media: Media;
  props: NativeProps;
}

type ScalarLiteral = BooleanLiteral | NullLiteral | NumericLiteral | StringLiteral;

// oxc returns ESTree nodes: every string, number, boolean and null is a `Literal`.
const isScalarLiteral = (node: Expression | undefined): node is ScalarLiteral =>
  node?.type === 'Literal' &&
  !('regex' in node && node.regex) &&
  !('bigint' in node && node.bigint !== undefined);

function literalValue(node: Expression | undefined): { value: StyleInput } | null {
  if (isScalarLiteral(node)) return { value: node.value };

  if (
    node?.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument?.type === 'Literal' &&
    typeof node.argument.value === 'number'
  )
    return { value: -node.argument.value };

  if (node?.type === 'TemplateLiteral' && !node.expressions.length)
    return { value: node.quasis[0].value.cooked };

  return null;
}

/** A static key's name, as `key.name ?? key.value` reads it. */
function keyName(key: PropertyKey | undefined) {
  if (key?.type === 'Identifier' || key?.type === 'PrivateIdentifier') return key.name;
  if (key?.type === 'Literal') return key.value;

  return undefined;
}

const isStylesCall = (node: Expression | null | undefined): node is CallExpression =>
  node?.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  node.callee.name === 'styles';

/** Every `styles()` call, each of which must initialize a const, wherever that const is. */
function stylesCalls(program: Program, fail: Fail) {
  const declared = new Set<CallExpression>();

  new Visitor({
    VariableDeclaration(declaration) {
      if (declaration.kind !== 'const') return;

      for (const item of declaration.declarations)
        if (isStylesCall(item.init)) declared.add(item.init);
    },
    CallExpression(call) {
      if (isStylesCall(call) && !declared.has(call))
        throw fail('Kuito styles() must initialize a const: const sheet = styles({ ... })', call);
    },
  }).visit(program);

  return [...declared];
}

type Fail = (message: string, node: Span) => Error;

/**
 * Each `styles()` sheet becomes its classes, and the module installs their
 * props: the pass's edits and the registry they install.
 */
export function inlineStylePass(
  { id, program, error }: ParsedModule,
  { platform }: { platform?: Platform } = {},
) {
  const fail: Fail = (message, node) => error(message, node.start);
  const calls = stylesCalls(program, fail);
  const styles: Record<string, NativeProps> = Object.create(null);
  const conditions: Pick<Sheet, 'when' | 'variants'> = {
    when: Object.create(null),
    variants: Object.create(null),
  };
  const sheet: Sheet = { filename: id, platform, fail, registry: styles, ...conditions };
  const edits: Edit[] = calls.map((call) => ({
    op: 'overwrite',
    start: call.start,
    end: call.end,
    text: JSON.stringify(compileSheet(call, sheet)),
  }));

  edits.push(...styleAttributes(program, fail));

  if (calls.length)
    edits.push({
      op: 'append',
      text:
        '\n' +
        systemSources(conditions) +
        'globalThis.__kuito.installStyles(' +
        JSON.stringify(styles) +
        (Object.keys(conditions.when).length || Object.keys(conditions.variants).length
          ? ',undefined,' + JSON.stringify({ themes: { light: {}, dark: {} }, ...conditions })
          : '') +
        ');',
    });

  return { edits, styles, conditions };
}

const NATIVE_PROPS = new Set(Object.keys(PROPS));

const PRIMITIVES = new Set(
  Object.entries(KINDS).flatMap(([kind, spec]) => (spec.primitive ? [kind] : [])),
);

/**
 * A primitive's `style={{ … }}`, compiled at build time: each literal
 * declaration becomes the native props it means, in place, so the kernel
 * receives an object of native props. A declaration whose value is an
 * expression must name one native prop (`opacity`, `paddingTop`), whose
 * value it then follows like any prop.
 */
function styleAttributes(program: Program, fail: Fail): Edit[] {
  const edits: Edit[] = [];

  new Visitor({
    JSXOpeningElement(element) {
      if (element.name.type !== 'JSXIdentifier' || !PRIMITIVES.has(element.name.name)) return;

      for (const attribute of element.attributes) {
        if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') continue;
        if (attribute.name.name !== 'style') continue;

        const value =
          attribute.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : null;

        if (!value || value.type !== 'ObjectExpression')
          throw fail(
            'Kuito style takes an object literal, compiled at build time: style={{ padding: 12 }}. Share styles with class.',
            attribute.value ?? attribute,
          );

        for (const decl of value.properties) {
          const prop = decl.type === 'Property' && !decl.computed ? keyName(decl.key) : undefined;

          if (
            decl.type !== 'Property' ||
            typeof prop !== 'string' ||
            (!isStyleProperty(prop) && !NATIVE_PROPS.has(prop))
          )
            throw fail('Kuito style: unsupported property ' + String(prop), decl);

          const literal = literalValue(decl.value);

          if (!literal) {
            if (NATIVE_PROPS.has(prop)) continue;

            throw fail(
              'Kuito style: ' +
                prop +
                ' takes a literal here; for a value that changes, set the props it writes (' +
                styleNatives(prop).join(', ') +
                ') instead',
              decl.value ?? decl,
            );
          }

          let props: NativeProps;

          try {
            props = expandStyle(prop, literal.value);
          } catch (error) {
            if (error instanceof StyleValueError)
              throw fail('Kuito style: ' + error.message, decl.value);

            throw error;
          }

          edits.push({
            op: 'overwrite',
            start: decl.start,
            end: decl.end,
            text: Object.entries(props)
              .map(([name, native]) => JSON.stringify(name) + ': ' + JSON.stringify(native))
              .join(', '),
          });
        }
      }
    },
  }).visit(program);

  return edits;
}

/** One module's sheets compiled on their own; null when it has none or does not parse. */
export function extractInlineStyles(
  source: string,
  filename = 'module.tsx',
  options: { platform?: Platform } = {},
) {
  const module = parseModule(filename, source);

  // The transform reports the syntax error.
  if (module.errors.length) return null;

  const { edits, styles, conditions } = inlineStylePass(module, options);

  return edits.length ? { ...render(source, filename, edits), styles, conditions } : null;
}

/** What compiling one module's sheets needs: their props go to `registry`. */
interface Sheet {
  filename: string;
  platform: Platform | undefined;
  fail: Fail;
  registry: Record<string, NativeProps>;
  /** Each class's `@media` alternates. */
  when: Record<string, Alternate[]>;
  /** Each class's variants: the class each value of each name applies. */
  variants: Record<string, Record<string, Record<string, string>>>;
}

/** One sheet's style names, each mapped to its generated class. */
function compileSheet(call: CallExpression, context: Sheet) {
  const { fail } = context;
  const sheet = call.arguments?.[0];

  if (!sheet || sheet.type !== 'ObjectExpression') {
    throw fail('Kuito styles() requires a static object of named styles', sheet ?? call);
  }

  const names: Record<string, string> = {};

  for (const style of sheet.properties || []) {
    const name = style.type === 'Property' ? keyName(style.key) : undefined;

    if (style.type !== 'Property' || !name || style.value?.type !== 'ObjectExpression')
      throw fail('Kuito styles requires static named objects', style);

    const declared = style.value.properties.filter((decl) => !isVariants(decl));
    const generated = compileStyle(declared, String(name), context);
    const variants = style.value.properties.find(isVariants);

    if (variants) compileVariants(variants, generated, String(name), context);

    names[String(name)] = generated;
  }

  return names;
}

type Declarations = ObjectExpression['properties'];

const isVariants = (decl: Declarations[number]) =>
  decl.type === 'Property' && !decl.computed && keyName(decl.key) === 'variants';

/** An object literal, or a build error naming what it should hold. */
function objectOf(node: Declarations[number], message: string, fail: Fail): ObjectExpression {
  const value = node.type === 'Property' ? node.value : null;

  if (value?.type !== 'ObjectExpression') throw fail('Kuito styles: ' + message, value ?? node);

  return value;
}

/**
 * `variants: { size: { small: { … }, large: { … } } }`: each value a class
 * of its own, which a class list names with `{ size: 'large' }`. Two
 * variants of a style that set one prop are an error: both can apply.
 */
function compileVariants(
  variants: Declarations[number],
  base: string,
  style: string,
  context: Sheet,
) {
  const { fail } = context;
  const group: Record<string, Record<string, string>> = {};
  const setBy: { name: string; label: string; keys: string[]; node: Declarations[number] }[] = [];
  const shape = 'variants: { <name>: { <value>: { … } } }';

  for (const dimension of objectOf(variants, 'variants takes an object of names, as ' + shape, fail)
    .properties) {
    const name = dimension.type === 'Property' ? keyName(dimension.key) : undefined;
    const values = objectOf(
      dimension,
      'variant ' + String(name) + ' takes an object of values, as ' + shape,
      fail,
    );

    group[String(name)] = {};

    for (const value of values.properties) {
      const valueName = String(value.type === 'Property' ? keyName(value.key) : '');
      const label = String(name) + '.' + valueName;
      const declared = objectOf(
        value,
        'variant ' + label + ' takes an object of declarations: ' + shape,
        fail,
      );
      const generated = compileStyle(declared.properties, style + '.' + label, context);
      const alternates = context.when[generated] ?? [];
      const keys = [context.registry[generated], ...alternates.map(({ props }) => props)].flatMap(
        (props) => Object.keys(props),
      );

      group[String(name)][valueName] = generated;
      setBy.push({ name: String(name), label, keys, node: value });
    }
  }

  for (const [index, later] of setBy.entries())
    for (const earlier of setBy.slice(0, index)) {
      const key =
        earlier.name === later.name
          ? undefined
          : later.keys.find((prop) => earlier.keys.includes(prop));

      if (key)
        throw fail(
          'Kuito styles: Conflicting declarations: ' +
            key +
            ' is set by both ' +
            earlier.label +
            ' and ' +
            later.label +
            ', which can apply at once. Set it in one of them.',
          later.node,
        );
    }

  context.variants[base] = group;
}

/** One style's declarations compiled to native props, registered under a generated class. */
function compileStyle(style: Declarations, key: string, context: Sheet): string {
  const alternates: Alternate[] = [];
  const props = declarations(style, context, { platform: null, media: null, alternates });
  const hash = createHash('sha256')
    .update(context.filename + '|' + key + '|' + JSON.stringify([props, alternates]))
    .digest('hex')
    .slice(0, 10);
  const generated = 'vx-' + hash;

  context.registry[generated] = props;
  if (alternates.length) context.when[generated] = alternates;

  return generated;
}

/** The blocks a declaration stands in, and where its style's `@media` blocks go. */
interface Inside {
  platform: Platform | null;
  media: Media | null;
  alternates: Alternate[];
}

/**
 * A style's declarations in order, a later one winning: an `@platform`
 * block's apply where it stands on its platform and nowhere else, and an
 * `@media` block's are an alternate set the kernel picks.
 */
function declarations(style: Declarations, context: Sheet, inside: Inside): NativeProps {
  const { fail, platform } = context;
  const props: NativeProps = {};

  for (const decl of style) {
    const prop = decl.type === 'Property' ? keyName(decl.key) : undefined;

    if (decl.type === 'Property' && typeof prop === 'string' && prop.startsWith('@media')) {
      if (inside.media)
        throw fail('Kuito styles: @media inside @media: join the features with and', decl.key);

      if (decl.value?.type !== 'ObjectExpression')
        throw fail('Kuito styles: ' + prop + ' takes an object of declarations', decl.value);

      let media: Media;

      try {
        media = parseMedia(prop.slice('@media'.length));
      } catch (error) {
        if (error instanceof StyleValueError)
          throw fail('Kuito styles: ' + error.message, decl.key);

        throw error;
      }

      const alternate: Alternate = { media, props: {} };

      inside.alternates.push(alternate);
      alternate.props = declarations(decl.value.properties, context, { ...inside, media });

      if ('fontSize' in alternate.props)
        throw fail(
          'Kuito styles: font-size cannot change with a condition: give each case a style of its own',
          decl.key,
        );

      continue;
    }

    if (decl.type === 'Property' && typeof prop === 'string' && prop.startsWith('@platform')) {
      const named = prop.slice('@platform'.length).trim();

      if (!isPlatform(named))
        throw fail('Kuito styles: @platform takes ios or android, got "' + named + '"', decl.key);

      if (inside.platform)
        throw fail(
          'Kuito styles: @platform inside @platform: a block names one platform',
          decl.key,
        );

      if (decl.value?.type !== 'ObjectExpression')
        throw fail('Kuito styles: ' + prop + ' takes an object of declarations', decl.value);

      if (!platform)
        throw fail(
          'Kuito styles: @platform needs the platform the bundle is for: compile with { platform }',
          decl.key,
        );

      if (named === platform)
        Object.assign(
          props,
          declarations(decl.value.properties, context, { ...inside, platform: named }),
        );

      continue;
    }

    if (decl.type !== 'Property' || typeof prop !== 'string' || !isStyleProperty(prop))
      throw fail(
        'Kuito styles: unsupported property ' + prop,
        (decl.type === 'Property' && decl.key) || decl,
      );

    const literal = literalValue(decl.value);

    if (!literal)
      throw fail('Kuito styles: ' + prop + ' must be a compile-time literal', decl.value ?? decl);

    try {
      Object.assign(props, expandStyle(prop, literal.value));
    } catch (error) {
      if (error instanceof StyleValueError)
        throw fail('Kuito styles: ' + error.message, decl.value);

      throw error;
    }
  }

  return props;
}
