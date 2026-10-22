/**
 * The public surface and what the site says about each part of it.
 *
 * `api-surface.txt` is the committed list of everything Kuito exposes: every
 * export of `kuito`, `kuito/config` and `kuito/tests`, every global, CLI command
 * and option, and CSS property, one line each with a hash of its signature. A
 * change to the public API changes this file, which is a reviewer's cue that the
 * docs need the same change.
 *
 * Every export must also have a description (JSDoc, or `content/api/descriptions.json`)
 * and an example (a complete docs example indexed by `generate-examples.ts`, or `content/api/examples/<id>.tsx`).
 * Its page exists by construction: the reference is the site's API index. Types
 * use a complete example directly or through an API that consumes that type.
 * Descriptions and examples for exports that no longer exist fail too.
 *
 * Usage: node scripts/check-coverage.ts           (after generate: writes api-surface.txt)
 *        node scripts/check-coverage.ts --check   (fails on a stale surface or any gap)
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Signature = { signature: string };

type Entry = {
  id: string;
  kind: string;
  description: string;
  type: string;
  overloads: Signature[];
  constructors: Signature[];
  members: { name: string; type?: string; signature?: string }[];
};

type Reference = {
  entries: Entry[];
  cliCommands: { name: string; usage: string }[];
  cliOptions: { flags: string[]; placeholder: string | null }[];
  cssProperties: { name: string; accepts: string }[];
};

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (path: string) => resolve(site, path);
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(at(path), 'utf8'));

const reference = await json<Reference>('src/content/reference.generated.json');
const usage = await json<Record<string, unknown[]>>('src/content/generated/usage.json');
const descriptions = await json<Record<string, string>>('content/api/descriptions.json');
const examplesDir = at('content/api/examples');
const examples = existsSync(examplesDir)
  ? (await readdir(examplesDir))
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => name.slice(0, -4))
  : [];

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);

const surface = [
  ...reference.entries.map(
    (entry) =>
      `${entry.id} ${entry.kind} ${hash([
        entry.type,
        entry.overloads.map((sig) => sig.signature),
        entry.constructors.map((sig) => sig.signature),
        entry.members.map((member) => [member.name, member.type ?? member.signature ?? '']),
      ])}`,
  ),
  ...reference.cliCommands.map((command) => `cli.${command.name} command ${hash(command.usage)}`),
  ...reference.cliOptions.map(
    (option) => `cli.${option.flags.join(',')} option ${hash(option.placeholder)}`,
  ),
  ...reference.cssProperties.map(
    (property) => `css.${property.name} property ${hash(property.accepts)}`,
  ),
]
  .sort()
  .join('\n')
  .concat('\n');

const ids = new Set(reference.entries.map((entry) => entry.id));
const gaps: string[] = [];

for (const entry of reference.entries) {
  const missing = [
    !entry.description.trim() && !descriptions[entry.id]?.trim() && 'description',
    !usage[entry.id]?.length && 'example',
  ].filter(Boolean);

  if (missing.length) gaps.push(`${entry.id} (${entry.kind}): no ${missing.join(', no ')}`);
}

const orphans = [
  ...Object.keys(descriptions)
    .filter((id) => id !== '$comment' && !ids.has(id))
    .map((id) => `content/api/descriptions.json: ${id} is not an export`),
  ...examples
    .filter((id) => !ids.has(id))
    .map((id) => `content/api/examples/${id}.tsx: ${id} is not an export`),
];

const surfaceFile = at('api-surface.txt');
const check = process.argv.includes('--check');
const stale =
  check && (!existsSync(surfaceFile) || (await readFile(surfaceFile, 'utf8')) !== surface);

if (!check) await writeFile(surfaceFile, surface);

const byReason = (reason: string) => gaps.filter((gap) => gap.includes('no ' + reason)).length;

console.log(
  `Coverage: ${reference.entries.length} exports, ${gaps.length} with gaps ` +
    `(${byReason('description')} without a description, ${byReason('example')} without an example), ` +
    `${orphans.length} orphans`,
);

for (const line of [...gaps, ...orphans]) console.log('  ' + line);

if (stale)
  console.log(
    'api-surface.txt is out of date: the public API changed. Run `npm run coverage` in apps/website, ' +
      'commit the file, and update the docs for what changed.',
  );

if (check && (stale || gaps.length || orphans.length)) process.exitCode = 1;
