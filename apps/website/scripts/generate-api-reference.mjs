/**
 * Generate a complete, source-grounded API reference from the framework's TypeScript exports.
 *
 * Intentionally uses the TypeScript checker, not a handwritten name list:
 * - follows re-exports, aliases, and wildcard exports
 * - captures every root module export and nested native namespace export
 * - preserves generics, overloads, arguments, return types, and JSDoc
 * - expands inherited component props and interface members
 * - includes /config exports and runtime globals declared by Kuito
 *
 * Usage: node scripts/generate-api-reference.mjs [--check]
 */
import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const src = resolve(repo, 'src');
const output = resolve(here, '../src/content/reference.generated.json');
const entry = resolve(src, 'ui/index.ts');
const configEntry = resolve(src, 'cli/kuito-config.ts');
const testsEntry = resolve(src, 'tests/index.ts');
const globalsEntry = resolve(src, 'ui/globals.d.ts');
const cliEntry = resolve(src, 'cli/config.ts');
const styleEntry = resolve(src, 'style/properties.ts');
const settings = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  types: [],
  lib: ['lib.es2022.d.ts'],
};
const program = ts.createProgram(
  [entry, configEntry, testsEntry, globalsEntry, cliEntry, styleEntry],
  settings,
);
const checker = program.getTypeChecker();
const flags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.MultilineObjectLiterals;
const docs = [];
const emitted = new Set();

function text(value) {
  return String(value ?? '');
}

function printedType(type, node, expand = false) {
  try {
    return text(
      checker.typeToString(type, node, flags | (expand ? ts.TypeFormatFlags.InTypeAlias : 0)),
    );
  } catch {
    return 'unknown';
  }
}

function resolveSymbol(symbol) {
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }

  return symbol;
}

function docText(symbol) {
  try {
    return text(ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim());
  } catch {
    return '';
  }
}

function tags(symbol) {
  try {
    return symbol.getJsDocTags(checker).map((tag) => ({
      name: tag.name,
      text: text(
        Array.isArray(tag.text) ? tag.text.map((p) => p.text).join('') : String(tag.text ?? ''),
      ),
    }));
  } catch {
    return [];
  }
}

function origin(symbol) {
  const d =
    symbol.declarations?.find((decl) => decl.getSourceFile().fileName.startsWith(src)) ??
    symbol.declarations?.[0];

  if (!d) return null;

  const file = relative(repo, d.getSourceFile().fileName).replaceAll('\\', '/');

  return { file, line: d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line + 1 };
}

function visibleProperties(type) {
  try {
    return checker.getPropertiesOfType(type).filter(
      (s) =>
        !(s.flags & ts.SymbolFlags.Private) &&
        // A string union is a set of choices, not a page of String.prototype methods.
        !s.declarations?.every((d) =>
          /\/typescript\/lib\/lib\..*\.d\.ts$/.test(d.getSourceFile().fileName),
        ),
    );
  } catch {
    return [];
  }
}

function isAnonymousObject(type) {
  return Boolean(
    type &&
    type.flags & ts.TypeFlags.Object &&
    type.objectFlags & ts.ObjectFlags.Anonymous &&
    !checker.isArrayType(type) &&
    !checker.isTupleType(type),
  );
}

function makeMember(symbol, at, depth = 0, seen = new Set()) {
  const d = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? at;
  let type;

  try {
    type = checker.getTypeOfSymbolAtLocation(symbol, d);
  } catch {
    type = checker.getDeclaredTypeOfSymbol(symbol);
  }

  const optional =
    !!(symbol.flags & ts.SymbolFlags.Optional) || !!(d && 'questionToken' in d && d.questionToken);
  const readonly = Boolean(d?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword));
  const fallback = d && 'initializer' in d && d.initializer ? d.initializer.getText() : undefined;
  const item = {
    name: symbol.getName(),
    type: printedType(type, d),
    optional,
    readonly,
    description: docText(symbol),
    tags: tags(symbol),
    ...(fallback && { default: fallback }),
  };
  const signatures = type.getCallSignatures?.() ?? [];

  if (signatures.length && depth <= 1)
    item.overloads = signatures.map((sig) => makeSignature(sig, d));

  if (depth < 3 && isAnonymousObject(type) && !seen.has(type)) {
    const members = visibleProperties(type);

    // Avoid inherited library prototypes and recursive third-party class definitions.
    if (members.length > 0 && members.length <= 60) {
      const next = new Set(seen);

      next.add(type);
      item.children = members.map((p) => makeMember(p, d, depth + 1, next));
    }
  }

  return item;
}

function makeSignature(sig, at) {
  return {
    signature: text(checker.signatureToString(sig, at, flags)),
    typeParameters: (sig.typeParameters ?? []).map((tp) => ({
      name: tp.symbol?.name ?? 'T',
      constraint: tp.getConstraint() ? printedType(tp.getConstraint(), at) : null,
      default: tp.getDefault() ? printedType(tp.getDefault(), at) : null,
    })),
    parameters: sig.getParameters().map((param) => {
      const atParam = param.valueDeclaration ?? param.declarations?.[0] ?? at;

      return {
        name: param.getName(),
        type: printedType(checker.getTypeOfSymbolAtLocation(param, atParam), atParam),
        optional:
          Boolean(param.flags & ts.SymbolFlags.Optional) ||
          Boolean(atParam && 'questionToken' in atParam && atParam.questionToken) ||
          Boolean(atParam && 'initializer' in atParam && atParam.initializer),
        rest: Boolean(atParam && 'dotDotDotToken' in atParam && atParam.dotDotDotToken),
        description: docText(param),
        ...(atParam && 'initializer' in atParam && atParam.initializer
          ? { default: atParam.initializer.getText() }
          : {}),
      };
    }),
    returns: printedType(sig.getReturnType(), at),
  };
}

function makeItem(exported, id, section) {
  const symbol = resolveSymbol(exported);
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];

  if (!decl) return;

  const key = section + ':' + id;

  if (emitted.has(key)) return;
  emitted.add(key);

  let type;

  try {
    type = checker.getTypeOfSymbolAtLocation(symbol, decl);
  } catch {
    type = checker.getDeclaredTypeOfSymbol(symbol);
  }

  const sigs = type.getCallSignatures?.() ?? [];
  const ctors = type.getConstructSignatures?.() ?? [];
  const exportedType =
    !(symbol.flags & ts.SymbolFlags.Value) &&
    Boolean(
      symbol.flags &
      (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeParameter),
    );
  const primitives = visibleProperties(type).some((s) => s.getName() === '__kuitoPrimitive');
  const propsName = symbol.getName() + 'Props';
  const name = exported.getName();
  // A component is an export JSX can render: a primitive, or a capitalized function
  // (module views included) whose call returns a KuitoNode or, when TSX infers it, a JSX element.
  const rendersNode = sigs.some((sig) => {
    const returned = checker.getReturnTypeOfSignature(sig);
    const named = (t) => (t.aliasSymbol ?? t.getSymbol())?.getName();
    const parts = returned.isUnion() ? [returned, ...returned.types] : [returned];

    return parts.some((part) => named(part) === 'KuitoNode' || named(part) === 'Element');
  });
  const component =
    !exportedType && section === 'root' && (primitives || (/^[A-Z]/.test(name) && rendersNode));
  let kind = exportedType ? 'type' : component ? 'component' : sigs.length ? 'function' : 'value';

  if (symbol.flags & ts.SymbolFlags.Class) kind = 'class';
  if (symbol.flags & ts.SymbolFlags.Enum) kind = 'enum';

  const info = {
    id: text(id),
    name: text(name),
    kind,
    section,
    description: docText(symbol) || docText(exported),
    tags: tags(symbol),
    source: origin(symbol),
    declaration: exportedType ? text(decl.getText().slice(0, 22000)) : '',
    type: printedType(
      exportedType ? checker.getDeclaredTypeOfSymbol(symbol) : type,
      decl,
      exportedType,
    ),
    overloads: sigs.map((sig) => makeSignature(sig, decl)),
    constructors: ctors.map((sig) => makeSignature(sig, decl)),
    members: [],
  };

  if (component && sigs.length) {
    const firstParam = sigs[0].getParameters()[0];

    if (firstParam) {
      const paramDecl = firstParam.valueDeclaration ?? firstParam.declarations?.[0] ?? decl;
      const props = checker.getTypeOfSymbolAtLocation(firstParam, paramDecl);

      info.propsType = printedType(props, decl);
      info.members = visibleProperties(props).map((p) => makeMember(p, paramDecl));
    }
  } else if (exportedType || kind === 'class' || kind === 'enum' || kind === 'value') {
    const object = exportedType ? checker.getDeclaredTypeOfSymbol(symbol) : type;

    info.members = visibleProperties(object)
      .filter((x) => !x.getName().startsWith('__'))
      .map((p) => makeMember(p, decl));
  }

  // A Web API like Headers or URL often merges "interface Headers" with
  // "var Headers: { new (...): Headers }". The value type contains static
  // constructors, while the declared type contains instance methods.
  // Include BOTH instead of reporting only the constructor object.
  if (section === 'global' && symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class)) {
    const instance = checker.getDeclaredTypeOfSymbol(symbol);
    const instanceMembers = visibleProperties(instance).map((p) => makeMember(p, decl));
    const existing = new Set(info.members.map((p) => p.name));

    info.members.push(...instanceMembers.filter((p) => !existing.has(p.name)));

    const interfaceDeclaration = symbol.declarations?.find((d) => ts.isInterfaceDeclaration(d));

    if (interfaceDeclaration) info.declaration = text(interfaceDeclaration.getText());
  }

  // Also show a component's exported FooProps even if it is declared elsewhere.
  if (component && !info.members.length) info.propsType = propsName;

  docs.push(info);
}

function moduleExports(path, section, prefix = '') {
  const file = program.getSourceFile(path);

  if (!file) throw new Error('Missing public API entry: ' + path);

  const module = checker.getSymbolAtLocation(file);

  if (!module) throw new Error('No TypeScript module symbol for ' + path);

  const exports = checker.getExportsOfModule(module);

  if (!exports.length) throw new Error('No exports found in ' + path);

  for (const ex of exports) {
    const name = ex.getName();

    if (name.startsWith('__') || name === 'default') continue;

    const target = resolveSymbol(ex);
    const decl = target.valueDeclaration ?? target.declarations?.[0];
    const namespace = Boolean(
      target.flags & ts.SymbolFlags.Module &&
      (!decl || ts.isSourceFile(decl) || ts.isModuleDeclaration(decl)),
    );

    if (namespace && section === 'root') {
      const children = checker.getExportsOfModule(target);

      docs.push({
        id: text(name),
        name: text(name),
        kind: 'namespace',
        section: 'native',
        description: docText(ex) || docText(target),
        tags: [],
        source: origin(target),
        declaration: '',
        type: '',
        overloads: [],
        constructors: [],
        members: [],
        children: children.filter((s) => !s.name.startsWith('_')).map((s) => text(s.getName())),
      });

      for (const child of children) {
        if (child.getName().startsWith('_')) continue;
        makeItem(child, name + '.' + child.getName(), 'native');
      }
    } else makeItem(ex, prefix + name, section);
  }
}

moduleExports(entry, 'root');
moduleExports(configEntry, 'config', 'config.');
moduleExports(testsEntry, 'tests', 'tests.');

const globals = program.getSourceFile(globalsEntry);

if (!globals) throw new Error('Missing runtime globals declarations');

for (const statement of globals.statements) {
  if (!ts.isModuleDeclaration(statement) || statement.name.getText() !== 'global') continue;

  const body = statement.body;

  if (!body || !ts.isModuleBlock(body)) continue;

  for (const statement of body.statements) {
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [statement];

    for (const decl of declarations) {
      if (!('name' in decl) || !decl.name || !ts.isIdentifier(decl.name)) continue;

      const name = decl.name.text;

      if (name.startsWith('__') || name === 'JSX') continue;

      const symbol = checker.getSymbolAtLocation(decl.name);

      if (symbol) makeItem(symbol, 'global.' + name, 'global');
    }
  }
}

/** AST-based metadata for the public CLI and the compiled CSS vocabulary. */
function propertyName(node) {
  if (!node) return '';

  return ts.isStringLiteral(node) || ts.isIdentifier(node) || ts.isNumericLiteral(node)
    ? node.text
    : node.getText();
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node))
  )
    node = node.expression;

  return node;
}

function literal(node) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);

  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties
        .filter(ts.isPropertyAssignment)
        .map((prop) => [propertyName(prop.name), literal(prop.initializer)]),
    );

  return null;
}

function initializer(path, variable) {
  const sf = program.getSourceFile(path);

  if (!sf) throw new Error('Missing metadata source: ' + path);

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;

    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === variable)
        return unwrap(decl.initializer);
    }
  }

  throw new Error('Missing ' + variable + ' in ' + path);
}

function docsMetadata() {
  const commands = initializer(cliEntry, 'COMMAND_TABLE');
  const options = initializer(cliEntry, 'OPTION_TABLE');
  const categories = initializer(styleEntry, 'STYLE_CATEGORIES');
  const properties = initializer(styleEntry, 'PROPERTIES');

  if (
    !ts.isArrayLiteralExpression(commands) ||
    !ts.isArrayLiteralExpression(options) ||
    !ts.isObjectLiteralExpression(categories) ||
    !ts.isObjectLiteralExpression(properties)
  )
    throw new Error('CLI/CSS metadata schema changed');

  const commandRows = commands.elements.map(literal).map((row) => ({
    ...row,
    usage: text(row.usage),
    summary: text(row.summary),
  }));
  const optionRows = options.elements.map(literal).map((row) => ({
    flags: row.flags,
    value: row.value ?? null,
    flag: row.flag ?? null,
    placeholder: row.placeholder ?? null,
    help: text(row.help),
  }));
  const descriptions = literal(categories);
  const cssRows = properties.properties.filter(ts.isPropertyAssignment).map((prop) => {
    const expr = unwrap(prop.initializer);
    let category = null;

    if (ts.isObjectLiteralExpression(expr)) {
      const categoryProp = expr.properties.find(
        (p) => ts.isPropertyAssignment(p) && propertyName(p.name) === 'category',
      );

      if (categoryProp) category = literal(categoryProp.initializer);
    } else if (ts.isCallExpression(expr)) {
      const args = expr.arguments;
      const last = args[args.length - 1];

      if (last && ts.isStringLiteral(last)) category = last.text;
    }

    return {
      name: propertyName(prop.name),
      category: category ?? 'other',
      accepts: descriptions[category] ?? 'See native styles reference',
    };
  });

  return { cliCommands: commandRows, cliOptions: optionRows, cssProperties: cssRows };
}

docs.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));

const categories = JSON.parse(
  await readFile(resolve(here, '../src/content/categories.json'), 'utf8'),
);
const components = docs.filter((d) => d.kind === 'component').map((d) => d.id);
const uncategorized = components.filter((id) => !(id in categories));
const unknown = Object.keys(categories).filter((id) => !components.includes(id));

if (uncategorized.length || unknown.length)
  throw new Error(
    'src/content/categories.json is out of step with the exported components:' +
      (uncategorized.length ? ' no category for ' + uncategorized.join(', ') + '.' : '') +
      (unknown.length ? ' not an exported component: ' + unknown.join(', ') + '.' : ''),
  );

const sectionCounts = Object.fromEntries(
  [...new Set(docs.map((d) => d.section))].map((group) => [
    group,
    docs.filter((d) => d.section === group).length,
  ]),
);
const metadata = docsMetadata();
const serialized =
  JSON.stringify(
    {
      version: JSON.parse(await readFile(resolve(repo, 'package.json'), 'utf8')).version,
      generated: 'TypeScript checker',
      counts: sectionCounts,
      entries: docs,
      ...metadata,
    },
    null,
    2,
  ) + '\n';

await writeFile(output, serialized);
console.log('Documented ' + docs.length + ' API entries: ' + JSON.stringify(sectionCounts));
