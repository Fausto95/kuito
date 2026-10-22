/** Compile every CSS property example and parse every CLI example; never execute a command. */
import { readFile } from 'node:fs/promises';
import { compileNativeCSS } from '../../../src/style/compiler.ts';
import { parseArgs } from '../../../src/cli/config.ts';
import cssExamples from '../content/api/css-examples.json' with { type: 'json' };
import cliExamples from '../content/api/cli-examples.json' with { type: 'json' };

const reference = JSON.parse(
  await readFile(new URL('../src/content/reference.generated.json', import.meta.url), 'utf8'),
) as {
  cssProperties: { name: string }[];
  cliCommands: { name: string }[];
};
let checked = 0;

for (const property of reference.cssProperties) {
  const example = (cssExamples as Record<string, { value: string; useCase: string }>)[
    property.name
  ];

  if (!example?.value || !example.useCase) throw new Error(`Missing CSS example: ${property.name}`);
  compileNativeCSS(`.example { ${property.name}: ${example.value}; }`);
  checked++;
}

for (const command of reference.cliCommands) {
  const example = (cliExamples as Record<string, { code: string; useCase: string }>)[command.name];

  if (!example?.code || !example.useCase) throw new Error(`Missing CLI example: ${command.name}`);

  const args = example.code.split(' ');

  if (args.shift() !== 'kuito')
    throw new Error(`CLI example must start with kuito: ${command.name}`);

  parseArgs(args);
  checked++;
}

for (const key of Object.keys(cssExamples)) {
  if (!reference.cssProperties.some((property) => property.name === key))
    throw new Error(`Orphan CSS example: ${key}`);
}

for (const key of Object.keys(cliExamples)) {
  if (!reference.cliCommands.some((command) => command.name === key))
    throw new Error(`Orphan CLI example: ${key}`);
}

console.log(`Reference examples: ${checked} CSS declarations and CLI commands checked`);
