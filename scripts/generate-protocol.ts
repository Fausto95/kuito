#!/usr/bin/env node
// Writes the files generated from src/protocol/manifest.ts and the style
// compiler's table (`npm run generate`).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateProtocol } from '../src/protocol/generate.ts';
import { MANIFEST } from '../src/protocol/manifest.ts';
import { generateStyleDocs, STYLES_DOC } from '../src/style/docs.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const files = {
  ...generateProtocol(MANIFEST, read),
  [STYLES_DOC]: generateStyleDocs(read(STYLES_DOC)),
};

for (const [path, text] of Object.entries(files)) {
  let current: string | null = null;

  try {
    current = read(path);
  } catch {}

  if (current === text) continue;

  writeFileSync(root + path, text);
  console.log('Generated ' + path);
}
