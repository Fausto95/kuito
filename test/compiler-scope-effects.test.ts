import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { createSourceCompiler, type Diagnostic } from '../src/dev/compiler.ts';

// A scope effect (docs/native-modules.md#scope-effects) belongs to the
// component setting up when it is called; called anywhere else, nothing would
// own it. The compiler reports such a call at its line instead of letting it
// throw on the device.

const UI = join(ROOT, 'src/ui');

function app(source: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-scope-')));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(dirname(join(root, 'app.tsx')), { recursive: true });
  writeFileSync(join(root, 'app.tsx'), source);

  return root;
}

const compile = (root: string) =>
  createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist') })(join(root, 'app.tsx'));

const header = `import { Text, Button } from '${UI}';
import { app, audio, keepAwake, videoRef } from '${UI}';
`;

test('scope effects in a component’s body compile', async () => {
  const root = app(`${header}
export default function App() {
  const song = audio.player('https://example.com/a.mp3');
  const memo = audio.recorder();
  const clip = videoRef();
  keepAwake();
  return <Text>{() => String(song.playing.value && memo.recording.value && clip.current)}</Text>;
}`);

  await compile(root);
});

test('outside setup, a scope effect needs { scope: app }', async () => {
  const root = app(`${header}
const theme = audio.player('https://example.com/theme.mp3', { scope: app });
const release = keepAwake({ scope: app });
export default function App() { return <Text>{String(theme.id) + String(release)}</Text>; }`);

  await compile(root);
});

test('a scope effect at module scope or in a handler is an error at its line', async () => {
  const root = app(`${header}
const song = audio.player('https://example.com/a.mp3');
export default function App() {
  return <Button text="Hold" onPress={() => keepAwake()} />;
}`);

  await assert.rejects(compile(root), (error: Error & { diagnostics?: Diagnostic[] }) => {
    assert.match(
      error.message,
      /audio\.player\(\) at line 4, keepAwake\(\) at line 6 run outside a component's setup, so nothing would own it/,
    );

    assert.match(error.message, /pass \{ scope: app \}/);

    assert.deepEqual(
      error.diagnostics?.map(({ line }) => line),
      [4],
    );

    return true;
  });
});

test('a view’s state ref outside setup is an error, with no app scope to offer', async () => {
  const root = app(`${header}
function helper() { return videoRef(); }
export default function App() { helper(); return <Text>hi</Text>; }`);

  await assert.rejects(compile(root), (error: Error) => {
    assert.match(error.message, /videoRef\(\) runs outside a component's setup/);
    assert.doesNotMatch(error.message, /scope: app/);

    return true;
  });
});
