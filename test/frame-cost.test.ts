import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { costOf } from '../src/tests/index.ts';
import type { HeadlessHost } from '../src/tests/host.ts';
import { press } from '../src/tests/interactions.ts';
import { useHost } from '../src/tests/session.ts';
import { headlessApp } from './support/headless.ts';

// Cost budgets on the headless host (docs/performance.md#cost-counters): what
// an interaction costs the main thread, in counts. benchmarks/frame-cost.md
// records the counts; a budget marked `fails` states the count a fix in
// kuito-frame-drops-novel-plan.md must reach, and fails the run once it
// does, so the budget is tightened in the same change.

async function app(): Promise<HeadlessHost> {
  const host = await headlessApp(join(ROOT, 'test/fixtures/frame-cost/app.tsx'));

  useHost(host);

  return host;
}

const viewWithId = (host: HeadlessHost, id: string) => {
  const found = [...host.renderer.views.values()].find(
    (view) => view.props.get('nativeID') === id || view.label === id,
  );

  assert.ok(found, `a view with id ${id}`);

  return found;
};

test('costOf counts what an interaction cost and nothing before it', async () => {
  const host = await app();
  const cost = await costOf(() => press(host, viewWithId(host, 'like')));

  assert.ok(cost.recordsApplied > 0);
  assert.ok(cost.propWrites > 0);
  assert.equal(cost.viewsCreated, 0);
});

test('a write of the value a view has is wasted', async () => {
  const host = await app();
  const like = viewWithId(host, 'like');
  const color = {
    op: 'prop',
    id: like.id,
    name: 'backgroundColor',
    type: 'color',
    value: 0xff0000ff,
  } as const;

  const cost = await costOf(() => {
    host.renderer.setProp(like, 'backgroundColor', color);
    host.renderer.setProp(like, 'backgroundColor', color);
  });

  assert.equal(cost.propWrites, 2);
  assert.equal(cost.wastedPropWrites, 1);
});

test('a layout with nothing dirty is no pass, and a pass that moved nothing is wasted', async () => {
  const host = await app();

  const clean = await costOf(() => host.renderer.layout());

  assert.equal(clean.layoutPasses, 0);
  assert.equal(clean.nodesLaidOut, 0);

  const label = viewWithId(host, 'like');

  const redone = await costOf(() => {
    host.renderer.engine.markDirty(label.node);
    host.renderer.layout();
  });

  assert.equal(redone.layoutPasses, 1);
  assert.equal(redone.wastedLayoutPasses, 1);
  assert.equal(redone.wastedFrames, redone.nodesFramed);
});

test('toStayWithin names every counter over its budget', async () => {
  const host = await app();
  const cost = await costOf(() => press(host, viewWithId(host, 'rename')));

  assert.throws(
    () => cost.toStayWithin({ measureCalls: 0, nodesFramed: 0, viewsCreated: 0 }),
    /Over budget: measureCalls \d+, budget 0; nodesFramed \d+, budget 0/,
  );

  assert.throws(
    () => cost.toStayWithin({ labelRedraws: 0 } as never),
    /counted by the renderer tests/,
  );
});

test('S1: a tap that changes only paint lays nothing out and creates no view', async () => {
  const host = await app();
  const cost = await costOf(() => press(host, viewWithId(host, 'like')));

  cost.toStayWithin({ layoutPasses: 0, nodesLaidOut: 0, measureCalls: 0, viewsCreated: 0 });
});

// A paint-only batch frames no view (docs/native-renderer.md#prop-effects).
test('S1: a tap that changes only paint frames no view', async () => {
  const host = await app();
  const cost = await costOf(() => press(host, viewWithId(host, 'like')));

  cost.toStayWithin({ nodesFramed: 0 });
});

test('S6: an idle second costs nothing', async () => {
  const host = await app();
  const cost = await costOf(() => host.advance(1000));

  cost.toStayWithin({
    recordsApplied: 0,
    propWrites: 0,
    layoutPasses: 0,
    nodesLaidOut: 0,
    nodesFramed: 0,
    measureCalls: 0,
    uiEntries: 0,
    viewsCreated: 0,
  });
});

// Target F3 (measure-ahead) and F2 (layout delta journal): one measure, and
// only the label and its parent framed.
test.fails('one label’s text among 100: 1 measure call, ≤ 2 nodes framed (target: F2, F3)', async () => {
  const host = await app();
  const cost = await costOf(() => press(host, viewWithId(host, 'rename')));

  cost.toStayWithin({ measureCalls: 1, nodesFramed: 2, viewsCreated: 0 });
});
