import { child, children, walk, type AstNode } from '../ast.ts';
import type { ParsedModule } from '../parse.ts';
import { KINDS } from '../../protocol/manifest.ts';

/** The primitives, whose content the compiler knows; any other element may render text. */
const PRIMITIVES = new Set(
  Object.entries(KINDS).flatMap(([kind, spec]) => (spec.primitive ? [kind] : [])),
);

/** The labels a screen reader reads: text a Text or Button shows. */
const LABELS = new Set(['Text', 'Button']);

/** Attributes that give a Pressable what to read, or take it out of the reader. */
const NAMED_BY = new Set(['label', 'aria-hidden']);

const nameOf = (element: AstNode) => {
  const name = child(child(element, 'openingElement') ?? element, 'name');

  return name?.type === 'JSXIdentifier' && typeof name.name === 'string' ? name.name : null;
};

/**
 * Whether `nodes` may put text in front of a screen reader: a Text or Button
 * with content, plain text, an expression, or an element the compiler cannot
 * see into (a component).
 */
function mayRead(nodes: AstNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === 'JSXText') return typeof node.value === 'string' && node.value.trim() !== '';

    if (node.type === 'JSXExpressionContainer')
      return child(node, 'expression')?.type !== 'JSXEmptyExpression';

    if (node.type === 'JSXFragment') return mayRead(children(node, 'children'));
    if (node.type !== 'JSXElement') return false;

    const name = nameOf(node);

    if (name === null || !PRIMITIVES.has(name)) return true;

    if (LABELS.has(name)) return children(node, 'children').length > 0;

    return mayRead(children(node, 'children'));
  });
}

/**
 * A Pressable is one screen reader element, read as its label or its
 * children's text (docs/accessibility.md). One with neither, an icon alone,
 * reads as nothing: a build error at its line.
 */
export function checkPressableLabels({ root, error }: ParsedModule): void {
  walk(root, (node) => {
    if (node.type === 'JSXElement' && nameOf(node) === 'Pressable') {
      const attributes = children(child(node, 'openingElement') ?? node, 'attributes');
      const named = attributes.some((attribute) => {
        if (attribute.type === 'JSXSpreadAttribute') return true;

        const name = child(attribute, 'name');

        return name?.type === 'JSXIdentifier' && NAMED_BY.has(String(name.name));
      });

      if (!named && !mayRead(children(node, 'children')))
        throw error(
          'This Pressable has nothing for a screen reader to read. ' +
            'Give it a label ("Play"), or text among its children.',
          node.start,
        );
    }
  });
}
