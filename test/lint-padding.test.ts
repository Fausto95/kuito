import { describe, it } from 'vite-plus/test';
import { RuleTester } from 'vite-plus/lint/plugins-dev';
import plugin from '../lint/kuito-plugin.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules['padding-between-blocks'];
const missing = { messageId: 'missing' };

new RuleTester().run('padding-between-blocks', rule, {
  valid: [
    // Imports, then a blank line.
    "import a from 'a';\nimport b from 'b';\n\nrun(a, b);",
    // Single-line statements may sit together.
    'a();\nb();\nc();',
    // Declaration groups stay together, even when one spans lines.
    'const a = 1;\nconst b = {\n  c: 2,\n};\nconst d = 3;',
    // Short blocks keep their return close.
    'function f() {\n  a();\n  return b;\n}',
    'function f() {\n  return b;\n}',
    // A comment belongs to the statement below it.
    'const a = 1;\n\n// explain the call\nrun(a);',
    // Multi-line statements are separated from their neighbours.
    'a();\n\nif (x) {\n  b();\n}\n\nc();',
    // Switch cases are checked like blocks.
    'switch (x) {\n  case 1:\n    a();\n    b();\n    break;\n}',
  ],
  invalid: [
    {
      code: "import a from 'a';\nrun(a);",
      output: "import a from 'a';\n\nrun(a);",
      errors: [missing],
    },
    {
      code: 'a();\nif (x) {\n  b();\n}\nc();',
      output: 'a();\n\nif (x) {\n  b();\n}\n\nc();',
      errors: [missing, missing],
    },
    {
      code: 'const a = 1;\nrun(a);\nconst b = 2;',
      output: 'const a = 1;\n\nrun(a);\n\nconst b = 2;',
      errors: [missing, missing],
    },
    {
      code: 'function f() {\n  a();\n  b();\n  return c;\n}',
      output: 'function f() {\n  a();\n  b();\n\n  return c;\n}',
      errors: [missing],
    },
    {
      code: 'function f() {\n  a();\n  b();\n  throw c;\n}',
      output: 'function f() {\n  a();\n  b();\n\n  throw c;\n}',
      errors: [missing],
    },
    {
      // Statements on one line are split and separated.
      code: 'const a = 1; run(a);',
      output: 'const a = 1;\n\n run(a);',
      errors: [missing],
    },
    {
      // The blank line goes above a comment that leads the next statement.
      code: 'const a = 1;\n// explain the call\nrun(a);',
      output: 'const a = 1;\n\n// explain the call\nrun(a);',
      errors: [missing],
    },
    {
      code: 'try {\n  a();\n} finally {\n  b();\n}\nc();',
      output: 'try {\n  a();\n} finally {\n  b();\n}\n\nc();',
      errors: [missing],
    },
  ],
});
