import {
  child,
  children,
  fingerprint,
  freeNames,
  isFunctionNode,
  nameOf,
  patternNames,
  type AstNode,
} from '../ast.ts';
import type { ParsedModule } from '../parse.ts';

/** A component the module defines: its identity, and the hash that says whether it changed. */
export interface ComponentDefinition {
  id: string;
  name: string;
  hash: string;
  cacheable: boolean;
}

/** What a top-level statement declares, without its `export`. */
const declarationOf = (statement: AstNode) =>
  statement.type.startsWith('Export') ? (child(statement, 'declaration') ?? statement) : statement;

/** The names a top-level statement binds; type-only declarations bind none at runtime. */
function boundBy(statement: AstNode): string[] {
  const declaration = declarationOf(statement);

  switch (declaration.type) {
    case 'ImportDeclaration':
      return children(declaration, 'specifiers').flatMap((each) =>
        patternNames(child(each, 'local')),
      );
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
      return patternNames(child(declaration, 'id'));
    case 'VariableDeclaration':
      return children(declaration, 'declarations').flatMap((each) =>
        patternNames(child(each, 'id')),
      );
    default:
      return [];
  }
}

/** A defined component and the function that is it, for its registration. */
export interface RegisteredComponent extends ComponentDefinition {
  node: AstNode;
  /** A function declaration, rather than a `const`'s function. */
  declaration: boolean;
}

/** The module's named functions, each a component identity: `function A` or `const A = () => …`. */
type Candidate = { name: string; node: AstNode; declaration: boolean };

function candidates(root: AstNode): Candidate[] {
  return children(root, 'body').flatMap((statement): Candidate[] => {
    const declaration = declarationOf(statement);
    const name = nameOf(child(declaration, 'id'));

    if (declaration.type === 'FunctionDeclaration')
      return name ? [{ name, node: declaration, declaration: true }] : [];

    if (declaration.type !== 'VariableDeclaration') return [];

    return children(declaration, 'declarations').flatMap((each) => {
      const id = nameOf(child(each, 'id'));
      const init = child(each, 'init');

      return id && init && isFunctionNode(init)
        ? [{ name: id, node: init, declaration: false }]
        : [];
    });
  });
}

/**
 * Every named module-level function is a component identity, not just the
 * default export: child components are retained by the same rule.
 *
 * A retained instance keeps the tree its last run built, so the hash covers
 * what the component means and every top-level statement it reads, directly
 * or through other top-level statements, by binding: a name its own local
 * shadows is not a read, and neither is a component it only renders as JSX,
 * whose own hash covers its edits. Positions, comments and formatting do not
 * count, so an edit that only lays code out differently re-runs nothing.
 */
export function componentDefinitions({ root, file }: ParsedModule): RegisteredComponent[] {
  const statements = children(root, 'body');
  const owner = new Map<string, AstNode>();
  const reads = new Map<AstNode, Set<string>>();
  const readsOf = (node: AstNode) => {
    const known = reads.get(node) ?? freeNames(node);

    reads.set(node, known);

    return known;
  };

  for (const statement of statements)
    for (const name of boundBy(statement)) owner.set(name, statement);

  return candidates(root).map(({ name, node, declaration }) => {
    const used = new Set<AstNode>();
    const pending = [...readsOf(node)];

    for (let read = pending.pop(); read !== undefined; read = pending.pop()) {
      const statement = owner.get(read);

      if (statement && !used.has(statement)) {
        used.add(statement);
        pending.push(...readsOf(statement));
      }
    }

    return {
      node,
      declaration,
      id: file + '#' + name,
      name,
      hash: fingerprint(node, ...statements.filter((statement) => used.has(statement))),
      cacheable: true,
    };
  });
}
