import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import type { HeadlessHost } from '../src/tests/host.ts';
import { press, scroll } from '../src/tests/interactions.ts';
import { headlessApp } from './support/headless.ts';

// Motion sources on the headless host (docs/motion.md#motion-sources): what a
// native view moves every frame, written into motion values on the UI thread.

const fixture = (name: string) => join(ROOT, 'test/fixtures', name);

const viewNamed = (host: HeadlessHost, label: string) => {
  const found = [...host.renderer.views.values()].find((view) => view.label === label);

  assert.ok(found, `a view labelled ${label}`);

  return found;
};

const shown = (host: HeadlessHost, label: string, prop: string) =>
  viewNamed(host, label).props.get(prop);

test('a Scroll moves views bound to its offset on the UI thread, with no batch from the JS thread', async () => {
  const host = await headlessApp(fixture('scroll-motion-app.tsx'));
  const feed = viewNamed(host, 'feed');

  assert.equal(feed.props.get('emitsMotion'), true, 'the Scroll sends its motion');
  assert.equal(shown(host, 'header', 'opacity'), 1);

  host.mutations.length = 0;
  await scroll(host, feed, { y: 100 });

  assert.equal(shown(host, 'header', 'translateY'), -50);
  assert.equal(shown(host, 'header', 'opacity'), 0.5);
  assert.deepEqual(host.mutations, [], 'the JS thread sent nothing');
});

test('velocity and overscroll move with the offset, each in its own motion value', async () => {
  const host = await headlessApp(fixture('scroll-motion-app.tsx'));
  const feed = viewNamed(host, 'feed');

  host.dispatch(feed.id, 'motion', { offset: 0, velocity: 500, overscroll: -20 });
  await host.settle();

  assert.equal(shown(host, 'speed', 'opacity'), 0.5);
  assert.equal(shown(host, 'header', 'scale'), 1.2, 'pulled 20 points past the top');
  assert.equal(shown(host, 'header', 'translateY'), -0, 'at the top: 0 halved and negated');
});

test('a horizontal List moves views bound to its offset', async () => {
  const host = await headlessApp(fixture('scroll-motion-app.tsx'));

  await scroll(host, viewNamed(host, 'rail'), { x: 200 });

  assert.equal(shown(host, 'poster', 'translateX'), -50);
  assert.equal(shown(host, 'header', 'translateY'), -0, 'the Scroll around it did not move');
});

test('a prop on the JS thread that reads the offset hears of each move', async () => {
  const host = await headlessApp(fixture('scroll-motion-watched-app.tsx'));

  await scroll(host, viewNamed(host, 'feed'), { y: 50 });
  await host.advance(1000 / 60);

  assert.equal(shown(host, 'header', 'scale'), 1.5);
});

test('a bar rides on the keyboard as it moves, on the UI thread, with no batch from the JS thread', async () => {
  const host = await headlessApp(fixture('keyboard-motion-app.tsx'));

  assert.ok(
    host.mutations.some(
      (m) => m.op === 'command' && m.name === 'keyboard.motion' && m.argument === 'on',
    ),
    "the app asked for the keyboard's moves",
  );

  host.mutations.length = 0;

  for (const height of [80, 200, 336]) host.dispatch(0, 'keyboard.move', { height });

  await host.settle();

  assert.equal(shown(host, 'bar', 'translateY'), -336);
  assert.deepEqual(host.mutations, [], 'the JS thread sent nothing');
});

const viewOfKind = (host: HeadlessHost, kind: string) => {
  const found = [...host.renderer.views.values()].find((view) => view.kind === kind);

  assert.ok(found, `a ${kind}`);

  return found;
};

test("a back swipe's progress moves the stack's screens on the UI thread", async () => {
  const host = await headlessApp(fixture('router-motion-app.tsx'));

  await press(host, viewNamed(host, 'to-show'));

  const stack = viewOfKind(host, 'NavigationStack');

  assert.equal(stack.props.get('emitsMotion'), true, 'the stack sends its back progress');

  host.mutations.length = 0;
  host.dispatch(stack.id, 'motion', { progress: 0.5 });
  await host.settle();

  assert.equal(shown(host, 'show', 'translateX'), 50);
  assert.equal(shown(host, 'home', 'opacity'), 0.75, 'every screen of the stack reads it');
  assert.deepEqual(host.mutations, [], 'the JS thread sent nothing');
});

test("a sheet's height and progress move the screen it shows, on the UI thread", async () => {
  const host = await headlessApp(fixture('router-motion-app.tsx'));

  await press(host, viewNamed(host, 'to-details'));

  const sheet = viewOfKind(host, 'Sheet');

  assert.equal(sheet.props.get('emitsMotion'), true);

  host.dispatch(sheet.id, 'motion', { height: 420, progress: 0.25 });
  await host.settle();

  assert.equal(shown(host, 'details', 'opacity'), 0.25);
  assert.equal(shown(host, 'details', 'translateY'), -42);
});
