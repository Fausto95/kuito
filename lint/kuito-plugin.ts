import { definePlugin, defineRule } from 'vite-plus/lint/plugins';
import type { ESTree, Ranged } from 'vite-plus/lint/plugins';
import {
  child,
  children,
  freeNames,
  isAstNode,
  isFunctionNode,
  patternNames,
  walk,
  type AstNode,
} from '../src/dev/ast.ts';

// Kuito's house rules for Oxlint. Oxlint has no padding-line-between-statements,
// so blank lines between logical blocks are enforced here; no-loop-closure
// guards against a device Hermes scoping difference.

type Statement = ESTree.Directive | ESTree.Statement;

const isImport = (node: Statement) => node.type === 'ImportDeclaration';
const isDeclaration = (node: Statement) => node.type === 'VariableDeclaration';
const isExit = (node: Statement) =>
  node.type === 'ReturnStatement' || node.type === 'ThrowStatement';

/** Why `next` must be separated from `previous`, or null. */
function separationReason(
  previous: Statement,
  next: Statement,
  index: number,
  text: (node: Ranged) => string,
) {
  if (isImport(previous)) return isImport(next) ? null : 'imports';
  if (isDeclaration(previous) && isDeclaration(next)) return null;
  if (isDeclaration(previous) !== isDeclaration(next)) return 'declarations';
  if (text(previous).includes('\n') || text(next).includes('\n')) return 'multi-line';
  if (isExit(next) && index >= 2) return 'exit';

  return null;
}

const paddingBetweenBlocks = defineRule({
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: { missing: 'Add a blank line to separate this block of code.' },
  },
  create(context) {
    const source = context.sourceCode;
    const text = (node: Ranged) => source.getText(node);

    function check(statements: Statement[]) {
      for (let index = 1; index < statements.length; index++) {
        const previous = statements[index - 1];
        const next = statements[index];

        if (!separationReason(previous, next, index, text)) continue;

        // Comments between the two belong to `next`; any blank line counts.
        const between = source.text.slice(previous.range[1], next.range[0]);
        const lines = between.split('\n');

        if (lines.slice(1, -1).some((line) => line.trim() === '')) continue;

        context.report({
          node: next,
          messageId: 'missing',
          fix: (fixer) =>
            fixer.insertTextAfterRange(previous.range, lines.length > 1 ? '\n' : '\n\n'),
        });
      }
    }

    return {
      Program: (node) => check(node.body),
      BlockStatement: (node) => check(node.body),
      StaticBlock: (node) => check(node.body),
      SwitchCase: (node) => check(node.consequent),
    };
  },
});

/** The closures in `node`, outermost only. */
function closures(node: AstNode): AstNode[] {
  const found: AstNode[] = [];

  walk(node, (each) => {
    if (!isFunctionNode(each)) return;

    found.push(each);

    return false;
  });

  return found;
}

const noLoopClosure = defineRule({
  meta: {
    type: 'problem',
    messages: {
      captured:
        'This closure captures a loop binding, which device Hermes shares across iterations. Use forEach or map.',
    },
  },
  create(context) {
    function check(head: unknown, body: unknown) {
      if (!isAstNode(head) || head.type !== 'VariableDeclaration' || head.kind === 'var') return;

      const names = new Set(
        children(head, 'declarations').flatMap((declaration) =>
          patternNames(child(declaration, 'id')),
        ),
      );

      if (!isAstNode(body)) return;

      for (const closure of closures(body))
        if ([...freeNames(closure)].some((name) => names.has(name)))
          context.report({ node: closure as never, messageId: 'captured' });
    }

    return {
      ForStatement: (node) => check(node.init, node.body),
      ForInStatement: (node) => check(node.left, node.body),
      ForOfStatement: (node) => check(node.left, node.body),
    };
  },
});

export default definePlugin({
  meta: { name: 'kuito' },
  rules: { 'padding-between-blocks': paddingBetweenBlocks, 'no-loop-closure': noLoopClosure },
});
