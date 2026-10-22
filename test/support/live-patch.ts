// Apps compiled as the dev server compiles them, and edited the way a Live
// Patch delivers an edit.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSourceCompiler } from '../../src/dev/compiler.ts';

/** The bundle the dev server sends for `entry`. */
export async function compileApp(entry: string): Promise<string> {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-app-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/**
 * The bundle after an edit that moves every UI-thread function: the compiler
 * names each by its place in its file, so each gets a new id, in the app's
 * code and in the UI bundle it carries. Components keep their identities.
 */
export async function compileEditedApp(entry: string): Promise<string> {
  return (await compileApp(entry)).replace(/\btf_([0-9a-f]{16})\b/g, 'tf_$1_edited');
}
