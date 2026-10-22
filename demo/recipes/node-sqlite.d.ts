// The part of Node's node:sqlite that offline-notes.test.tsx uses. demo/
// type-checks as app code, without @types/node: its globals (a Timeout from
// setTimeout) would leak into every screen.
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export interface StatementSync {
    setReturnArrays(enabled: boolean): void;
    columns(): { name: string }[];
    all(...params: SQLInputValue[]): unknown[];
    run(...params: SQLInputValue[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
