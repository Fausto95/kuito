// Node's test runner and strict assertions as a test file sees them through
// `kuito/tests`, typed here: an app's tsconfig has no Node types, and an
// assertion narrows only through a declared type.
import strict from 'node:assert/strict';
import { describe as nodeDescribe, test as nodeTest } from 'node:test';

type Body = (context: unknown) => void | Promise<void>;

interface Define {
  (name: string, body: Body): void;
  (
    name: string,
    options: { skip?: boolean | string; only?: boolean; timeout?: number },
    body: Body,
  ): void;
}

/** What `assert` does, as Node's strict mode has it. */
interface Assert {
  (value: unknown, message?: string): asserts value;
  ok(value: unknown, message?: string): asserts value;
  equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
  notEqual(actual: unknown, expected: unknown, message?: string): void;
  deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
  notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
  match(text: string, pattern: RegExp, message?: string): void;
  doesNotMatch(text: string, pattern: RegExp, message?: string): void;
  throws(run: () => unknown, expected?: RegExp | object, message?: string): void;
  rejects(
    run: Promise<unknown> | (() => Promise<unknown>),
    expected?: RegExp | object,
    message?: string,
  ): Promise<void>;
  fail(message?: string): never;
}

export const test: Define = nodeTest;
export const describe: Define = nodeDescribe;
export const assert: Assert = strict;
