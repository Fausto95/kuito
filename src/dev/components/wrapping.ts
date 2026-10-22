import {
  bindings,
  child,
  children,
  fingerprint,
  isAstNode,
  isFunctionNode,
  nameOf,
  walk,
  type AstNode,
} from '../ast.ts';
import type { Edit } from '../edits.ts';
import { isVerbatimAttribute } from '../../protocol/attributes.ts';

/**
 * JSX data expressions become lazy signals, `{a + b}` →
 * `__kuitoExpr("<fingerprint>", () => (a + b))`; event callbacks stay
 * callbacks, a class read from a stylesheet stays as it is, since nothing
 * can change it, and nothing outside JSX is touched. Returns the edits and the
 * expressions wrapped, which the thread pass compiles as functions.
 *
 * The call opens left of the expression and the arrow right of it, so a pass
 * after this one can insert between the two: the thread pass tags the arrow.
 */
export function wrapExpressions(root: AstNode) {
  const edits: Edit[] = [];
  const expressions: AstNode[] = [];
  const sheets = stylesheets(root);

  walk(root, (node, parent) => {
    const expression =
      node.type === 'JSXExpressionContainer' ? child(node, 'expression') : undefined;

    if (!expression || expression.type === 'JSXEmptyExpression') return;

    // A namespaced name (`a:b`) yields its JSXIdentifier, which is never an event name.
    const attribute = parent?.type === 'JSXAttribute' ? child(parent, 'name') : undefined;
    const name = attribute?.type === 'JSXIdentifier' ? String(attribute.name) : undefined;

    if ((name !== undefined && isVerbatimAttribute(name)) || isFunctionNode(expression)) return;
    if (name === 'class' && isStaticClass(expression, sheets)) return;

    // Structural child expressions containing JSX are not yet supported as
    // reactive expressions. Leave them eager; future work adds keyed diffing.
    const nestedJSX = expression.type === 'JSXElement' || expression.type === 'JSXFragment';
    const structuralChildren = parent?.type !== 'JSXAttribute' && nameOf(expression) === 'children';

    if (nestedJSX || structuralChildren) return;

    // By meaning, as component hashes are: a reformatted expression keeps its value.
    const key = JSON.stringify(fingerprint(expression));

    expressions.push(expression);

    edits.push(
      { op: 'appendLeft', at: expression.start, text: `__kuitoExpr(${key}, ` },
      { op: 'prependRight', at: expression.start, text: '() => (' },
      { op: 'appendLeft', at: expression.end, text: ')' },
      { op: 'prependRight', at: expression.end, text: ')' },
    );
  });

  return { edits, expressions };
}

/**
 * The module's stylesheets: default imports of a .css file and consts
 * initialized by styles(), each bound nowhere else, so no scope shadows it.
 */
function stylesheets(program: AstNode): Set<string> {
  const declared = children(program, 'body').flatMap((statement) => {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement;

    if (!declaration) return [];

    if (declaration.type === 'ImportDeclaration')
      return String(child(declaration, 'source')?.value).endsWith('.css')
        ? children(declaration, 'specifiers')
            .filter((specifier) => specifier.type === 'ImportDefaultSpecifier')
            .flatMap((specifier) => nameOf(child(specifier, 'local')) ?? [])
        : [];

    if (declaration.type === 'VariableDeclaration' && declaration.kind === 'const')
      return children(declaration, 'declarations').flatMap((declarator) => {
        const init = child(declarator, 'init');

        return init?.type === 'CallExpression' && nameOf(child(init, 'callee')) === 'styles'
          ? (nameOf(child(declarator, 'id')) ?? [])
          : [];
      });

    return [];
  });
  const bound = bindings(program);

  return new Set(declared.filter((name) => bound.indexOf(name) === bound.lastIndexOf(name)));
}

/**
 * Class names: a string, a sheet's class, data attributes of literals
 * (`{ size: 'large' }`), or a list of them; false and null are skipped.
 */
const STATIC_CLASSES: Record<string, (node: AstNode, sheets: Set<string>) => boolean> = {
  Literal: (node) => typeof node.value === 'string' || node.value === false || node.value === null,
  TemplateLiteral: (node) => children(node, 'expressions').length === 0,
  ParenthesizedExpression: (node, sheets) => isStaticClass(child(node, 'expression'), sheets),
  ArrayExpression: (node, sheets) =>
    Array.isArray(node.elements) &&
    node.elements.every((element) => isStaticClass(element, sheets)),
  MemberExpression: (node, sheets) =>
    !node.computed && sheets.has(nameOf(child(node, 'object')) ?? ''),
  ObjectExpression: (node) =>
    children(node, 'properties').every((property) => {
      const value = child(property, 'value');

      return (
        property.type === 'Property' &&
        !property.computed &&
        (value?.type === 'Literal' || value?.type === 'TemplateLiteral') &&
        STATIC_CLASSES[value.type](value, new Set())
      );
    }),
};

function isStaticClass(node: unknown, sheets: Set<string>): boolean {
  return isAstNode(node) && (STATIC_CLASSES[node.type]?.(node, sheets) ?? false);
}
