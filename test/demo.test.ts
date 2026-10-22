import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compileNativeCSS } from '../src/style/compiler.ts';
import { compileApp, compileEditedApp } from './support/live-patch.ts';
import { linkedFunction, linkedNames } from './support/fake-modules.ts';
import { present } from './support/present.ts';
import { bytes, textHost } from './support/fake-http.ts';
import { installUIKernel } from './support/ui-host.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent, type HostRecord } from './support/host-wire.ts';

// The demo app against a fake TVMaze: real compiler, real kernel, the network
// and timers answered by this host.

const API = 'https://api.tvmaze.com';
const fixture = (name: string) => readFileSync(`test/fixtures/tvmaze/${name}.json`, 'utf8');

type Route = { status: number; body: string };

/** The kernel's side of linked calls. */
interface Linked {
  __kuitoLinkSettle(call: number, value: unknown): void;
  __kuitoLinkEmit(id: number, value: unknown): void;
}

/** A built-in member's id, as the compiler numbers it. */
function linkedIdOf(name: string): number {
  const found = [...linkedNames].find(([, each]) => each === name);

  if (!found) throw new Error(`${name} is not a built-in module's member`);

  return found[0];
}

/** The kernel's side of fetch, installed when the host has an HTTP client. */
interface Network {
  __kuitoHttpHead(id: number, status: number, url: string, headers: string[]): void;
  __kuitoHttpEnd(id: number, body: ArrayBuffer, error: string): void;
}

const ROUTES: [RegExp, () => Route][] = [
  [/\/shows\?page=\d+$/, () => ({ status: 200, body: fixture('shows') })],
  [/\/search\/shows\?q=/, () => ({ status: 200, body: fixture('search') })],
  [/\/shows\/\d+\/cast$/, () => ({ status: 200, body: fixture('cast') })],
];

/** Lets fetches, timers and re-renders run to completion. */
async function settle() {
  for (let turn = 0; turn < 12; turn++) await new Promise((done) => setTimeout(done, 0));
}

async function launch({ failing = false, ui = false } = {}) {
  const views = new Map<string, HostView>();
  const order: string[] = [];
  const requests: string[] = [];
  const commands: [string, string, string][] = [];
  const network = { failing };
  const timers = new Map<number, NodeJS.Timeout>();
  const clipboard = { text: '' };
  // Reel's tokens follow the color scheme the platform reports.
  const appearance = { scheme: 'dark' };
  const commits: HostRecord[][] = [];
  let players = 0;
  const nativeCalls: string[] = [];
  const uiThread = ui ? installUIKernel() : null;
  /** Each list's cell per key: like a native list as tall as its rows, it binds every row. */
  const cells = new Map<string, Map<string, string>>();
  const bindRows = (list: string, keys: string[]) => {
    const bound = cells.get(list) ?? new Map<string, string>();

    cells.set(list, bound);

    keys
      .filter((key) => !bound.has(key))
      .forEach((key) => {
        const cell = `${list}:cell-${bound.size}`;

        bound.set(key, cell);
        nativeEvent(host.__kuito, `${list}.bind\u001f${JSON.stringify({ cell, key })}`);
      });
  };
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
        order.push(id);
      },
      setProp(id: string, name: string, value: unknown) {
        const view = present(views.get(id), id);

        view.props[name] = value;

        // The kernel is mid-commit: bind on the next turn, as a native frame would.
        if (name === 'keys' && view.kind.endsWith('List') && Array.isArray(value))
          setTimeout(() => views.has(id) && bindRows(id, value.map(String)), 0);
      },
      removeView(id: string) {
        views.delete(id);
        cells.delete(id);
      },
      moveView() {},
      command(id: string, name: string, argument: string) {
        commands.push([id, name, argument]);
      },
      commit(records) {
        commits.push(records);
      },
      // Linked functions: the clipboard, audio, and haptics, which answer with nothing.
      __kuitoHostCall(id: number) {
        const name = linkedFunction(id).join('.');

        nativeCalls.push(name);

        if (name === 'Appearance.colorScheme') return appearance.scheme;

        // An iPhone 18 Pro's window, in portrait.
        if (name === 'Window.metrics')
          return {
            width: 402,
            height: 874,
            insets: { top: 62, left: 0, bottom: 34, right: 0 },
            orientation: 'portrait',
          };

        if (name === 'Audio.nextId') return ++players;

        return name === 'Clipboard.hasText' ? clipboard.text !== '' : false;
      },
      __kuitoHostCallAsync(id: number, call: number, ...args: unknown[]) {
        const name = linkedFunction(id).join('.');

        nativeCalls.push(`${name}(${JSON.stringify(args)})`);

        if (name === 'Clipboard.writeText') clipboard.text = String(args[0]);

        const value = name === 'Clipboard.readText' ? clipboard.text : null;

        setTimeout(() => (host as unknown as Linked).__kuitoLinkSettle(call, value), 0);
      },
      __kuitoHostObserve() {},
      // Timers fire on the next turn whatever their delay; clearing one cancels it.
      __kuitoHostSetTimer(id: number, _delay: number, callback: () => void) {
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            callback();
          }, 0),
        );
      },
      __kuitoHostClearTimer(id: number) {
        clearTimeout(timers.get(id));
        timers.delete(id);
      },
      ...textHost,
      __kuitoHostHttp: {
        start(id: number, { url }: { url: string }) {
          requests.push(url);

          const route = ROUTES.find(([pattern]) => pattern.test(url));
          const { status, body } = network.failing
            ? { status: 500, body: '' }
            : (route?.[1]() ?? { status: 404, body: '' });

          setTimeout(() => complete(id, status, url, body), 0);
        },
        stream() {},
        cancel() {},
      },
      ...(uiThread && {
        ui: (operations: unknown[]) => uiThread.ui.receive(structuredClone(operations)),
        uiScript(source: string) {
          uiThread.load(source);
        },
        __kuitoHostMotionRead: (id: string) => uiThread.mirror.get(id),
      }),
    }),
  );

  const complete = (id: number, status: number, url: string, body: string) => {
    const network = host as unknown as Network;

    network.__kuitoHttpHead(id, status, url, ['content-type', 'application/json']);
    network.__kuitoHttpEnd(id, bytes(body), '');
  };

  runInNewContext(await compileApp('demo/app'), host);

  const firstRender = host.__kuito.stats().total;

  await settle();

  const texts = () =>
    order.flatMap((id) => {
      const view = views.get(id);

      return view?.kind === 'Text' ? [String(view.props.text)] : [];
    });

  return {
    host,
    firstRender,
    uiThread,
    views,
    clipboard,
    nativeCalls,
    appearance,
    commits,
    requests,
    commands,
    network,
    texts,
    /** Delivers a native event without letting anything else run. */
    send(id: string, payload?: object) {
      nativeEvent(host.__kuito, id + (payload ? '\u001f' + JSON.stringify(payload) : ''));
    },
    /** What the platform sends for a linked event or live value. */
    sendLinked(member: string, value: unknown) {
      (host as unknown as Linked).__kuitoLinkEmit(linkedIdOf(member), value);
    },
    async press(id: string, payload?: object) {
      this.send(id, payload);
      await settle();
    },
    /** The sheet the details route shows in, while it is open. */
    detailsSheet() {
      const parent = views.get('details')?.parent;

      return parent === undefined ? undefined : { id: parent, view: views.get(parent) };
    },
    /** Swipes the details sheet away, as the user does. */
    async closeDetails() {
      const sheet = this.detailsSheet();

      assert.ok(sheet, 'a details sheet is open');
      await this.press(sheet.id + '.close');
    },
  };
}

test('Discover loads shows from TVMaze into the hero and the rails', async () => {
  const app = await launch();

  assert.deepEqual(app.requests, [`${API}/shows?page=0`]);
  assert.ok(app.views.has('hero-169'), 'the best rated show leads');
  assert.ok(app.texts().includes('Breaking Bad'));
  assert.ok(app.views.has('top-82'), 'a top rated rail');
  assert.ok(app.views.has('drama-179'), 'a genre rail');

  const posters = [...app.views.entries()]
    .filter(([id, view]) => view.kind === 'Image' && id !== 'reel-logo')
    .map(([, view]) => view);

  assert.ok(posters.length >= 8);

  assert.ok(
    posters.every((view) => String(view.props.src).startsWith('https://static.tvmaze.com')),
  );
});

test('the brand is an image bundled with the app, the rating a Symbol', async () => {
  const app = await launch();
  const logo = present(app.views.get('reel-logo'), 'the logo').props;
  const star = present(app.views.get('hero-rating'), 'the rating star');

  assert.deepEqual(logo.src, {
    asset: 'asset_reel_assets_logo',
    width: 20,
    height: 20,
  });

  assert.deepEqual([logo.width, logo.height], [20, 20], 'its own size, in points');
  assert.equal(star.kind, 'Symbol');
  assert.equal(star.props.name, 'star');
});

test('a poster opens its details sheet and loads the cast', async () => {
  const app = await launch();

  await app.press('top-82.press');

  const sheet = present(app.detailsSheet()?.view, 'details sheet');

  assert.equal(sheet.kind, 'Sheet');
  assert.equal(sheet.props.open, true);
  assert.deepEqual(sheet.props.snapPoints, ['72%', '100%']);
  assert.ok(app.requests.includes(`${API}/shows/82/cast`));
  assert.ok(app.texts().includes('Game of Thrones'));
  assert.ok(app.texts().includes('Bryan Cranston'));

  await app.closeDetails();
  assert.equal(app.detailsSheet(), undefined, 'closing it closes the route');

  await app.press('top-82.press');
  assert.equal(app.detailsSheet()?.view?.props.open, true, 'it opens again');
});

test('the details page scrolls down to the sheet’s bottom edge', async () => {
  const app = await launch();

  await app.press('top-169.press');

  const page = present(app.views.get('details'), 'details page');
  const scroll = present(
    [...app.views.values()].find((view) => view.kind === 'Scroll' && view.parent === 'details'),
    'details scroll',
  );

  assert.equal(scroll.props.flex, 1, 'the scroll fills the page');
  // Space under the Scroll would be a blank band its content is cut off above.
  assert.equal(page.props.paddingBottom ?? 0, 0, 'the page adds no space under its scroll');
});

test('opening another show while the sheet is open shows that show', async () => {
  const app = await launch();
  const inSheet = (view: HostView | undefined): boolean =>
    !!view && (view.parent === 'details' || inSheet(app.views.get(view.parent)));
  const sheetTexts = () =>
    [...app.views.values()]
      .filter((view) => view.kind === 'Text' && inSheet(view))
      .map((view) => String(view.props.text));

  await app.press('top-169.press');

  assert.ok(sheetTexts().includes('Breaking Bad'));

  await app.press('top-82.press');

  assert.ok(sheetTexts().includes('Game of Thrones'), sheetTexts().join(' | '));
  assert.ok(!sheetTexts().includes('Breaking Bad'), 'the first show is gone');
});

test('a show opened after closing another loads its own cast', async () => {
  const app = await launch();

  await app.press('top-169.press');
  await app.closeDetails();
  await app.press('top-82.press');

  assert.ok(app.requests.includes(`${API}/shows/82/cast`));
});

test('showing another show in the details sheet re-plans the sheet alone', async () => {
  const app = await launch();

  await app.press('top-169.press');
  await app.closeDetails();
  app.send('top-82.press');
  await Promise.resolve();

  const { lastReplan } = app.host.__kuito.stats();

  // The whole of Reel's app module evaluated 165 thunks and replaced 59 subscriptions.
  assert.ok(lastReplan.thunkEvaluations < 50, lastReplan.thunkEvaluations + ' thunks');
  assert.ok(lastReplan.subscriptionsDestroyed < 5, lastReplan.subscriptionsDestroyed + ' gone');
});

test('Reel’s first render tracks no class read from a stylesheet', async () => {
  const { firstRender } = await launch();

  // A class read from a stylesheet never changes, so it costs no thunk. The
  // Lab's 12 Actions track their two classes each, which follow `primary`;
  // the window's width class, which Reel's margins follow, is one computed;
  // the stack's back motion source, given to its NavigationStack, is one more.
  assert.ok(firstRender.thunkEvaluations <= 198, firstRender.thunkEvaluations + ' thunks');
});

test('Reel’s theme switch sends only token-backed props and plans nothing again', async () => {
  const app = await launch();
  const { replans } = app.host.__kuito.stats();
  const from = app.commits.length;

  app.appearance.scheme = 'light';
  app.sendLinked('Appearance.colorScheme', 'light');
  await settle();

  const records = app.commits.slice(from).flat();
  // What tokens.css's themes differ in: colors, and the hero's gradient.
  const tokenBacked = [
    'backgroundColor',
    'backgroundGradient',
    'borderColor',
    'color',
    'shadowColor',
  ];

  assert.equal(app.host.__kuito.stats().replans, replans, 'no branch is planned again');
  assert.equal(app.commits.length - from, 1, 'one commit');
  assert.ok(records.length > 0);

  for (const record of records) {
    assert.equal(record.op, 'prop', 'no view is created, moved or removed');
    if (record.op === 'prop') assert.ok(tokenBacked.includes(record.name), record.name);
  }

  assert.ok(
    [...app.views.values()].some((view) => view.props.backgroundColor === '#f6f6f8'),
    'the screens take the light background',
  );
});

test('a saved show appears in My List', async () => {
  const app = await launch();

  await app.press('top-82.press');
  await app.press('save.press');
  await app.closeDetails();
  await app.press('tab-library.press');
  await app.press('segment-saved.press');

  assert.ok(app.views.has('saved-82'));
});

test('the Lab copies a link through the clipboard module and reads it back', async () => {
  const app = await launch();

  await app.press('tab-lab.press');
  await app.press('lab-copy.press');

  assert.equal(app.clipboard.text, 'https://www.tvmaze.com');
  assert.ok(app.texts().includes('Copied ✓'));

  await app.press('lab-paste.press');

  assert.ok(app.texts().includes('Clipboard: https://www.tvmaze.com'));
  assert.ok(app.nativeCalls.includes('Clipboard.readText([])'));
});

test('search waits for typing to pause, then asks TVMaze once', async () => {
  const app = await launch();

  await app.press('tab-search.press');
  app.requests.length = 0;
  app.send('search.change', { text: 'gi' });
  await app.press('search.change', { text: 'girls' });

  assert.deepEqual(
    app.requests.filter((url) => url.includes('/search/')),
    [`${API}/search/shows?q=girls`],
  );

  assert.ok(app.views.has('result-139'), 'results are listed');
});

test('the search key searches at once, and the result count is announced', async () => {
  const app = await launch();

  await app.press('tab-search.press');

  const field = present(app.views.get('search'), 'search field').props;

  assert.equal(field.enterKeyHint, 'search');
  assert.equal(field.label, 'Search shows');

  app.send('search.change', { text: 'girls' });
  await app.press('search.submit', { text: 'girls' });

  assert.deepEqual(
    app.requests.filter((url) => url.includes('/search/')),
    [`${API}/search/shows?q=girls`],
  );

  const announcements = app.commands
    .filter(([, name]) => name === 'accessibility.announce')
    .map(([, , argument]) => JSON.parse(argument).message);

  assert.deepEqual(announcements, ['3 shows found']);
});

test('the tab bar reads as tabs, the current one selected', async () => {
  const app = await launch();
  const tab = (name: string) => present(app.views.get('tab-' + name), name).props;

  assert.equal(present(app.views.get('tabs'), 'tabs').props.role, 'tablist');
  assert.equal(tab('discover').role, 'tab');
  assert.equal(tab('discover')['aria-selected'], true);
  assert.equal(tab('search')['aria-selected'], false);

  await app.press('tab-search.press');

  assert.equal(tab('discover')['aria-selected'], false);
  assert.equal(tab('search')['aria-selected'], true);
});

test('a failed load offers a retry that recovers', async () => {
  const app = await launch({ failing: true });

  assert.ok(app.views.has('retry'));
  assert.ok(!app.views.has('hero-169'));

  app.network.failing = false;
  await app.press('retry.press');

  assert.ok(app.views.has('hero-169'));
});

test('the theme compiles to native styles', () => {
  const compiled = compileNativeCSS(
    readFileSync('demo/reel/theme.css', 'utf8'),
    'demo/reel/theme.css',
  );

  for (const name of ['screen', 'hero', 'poster', 'tabBar', 'sheet'])
    assert.ok(compiled.classes[name], `.${name}`);
});

test('200 Live Patches over Reel leave what the kernels hold flat', async () => {
  const app = await launch({ ui: true });
  const ui = present(app.uiThread, 'UI thread');
  const versions = [await compileEditedApp('demo/app'), await compileApp('demo/app')];
  const held = () => ({ js: app.host.__kuito.stats().held, ui: ui.ui.stats() });
  const round = async (index: number) => {
    runInNewContext(versions[index % 2], app.host);
    await settle();
    await app.press('top-82.press');
    await app.closeDetails();
  };

  await round(0);

  const before = held();

  for (let index = 1; index < 200; index++) await round(index);

  const after = held();

  assert.ok(before.js.states > 0 && before.js.views > 0, JSON.stringify(before));
  assert.deepEqual(after, before);
});

test('the Lab’s audio progress moves on the UI thread, with no JS work while playing', async () => {
  const app = await launch({ ui: true });

  await app.press('tab-lab.press');
  await app.press('lab-listen.press');

  assert.ok(
    app.nativeCalls.some((call) => call.startsWith('Audio.createPlayer(')),
    'the player is made when its view mounts',
  );

  assert.ok(app.nativeCalls.includes('Audio.play([1])'), 'and starts playing');

  app.sendLinked('Audio.playerStatus', {
    id: 1,
    isLoaded: true,
    playing: true,
    isBuffering: false,
    currentTime: 0,
    duration: 100,
    ended: false,
    volume: 1,
    rate: 1,
    loop: false,
    error: null,
  });

  await settle();

  const ui = present(app.uiThread, 'the UI thread');
  const progress = handleOf(app.host.__kuito, 'lab-progress');
  const before = app.host.__kuito.stats().total;
  const sent = ui.sent.length;
  const moved = () =>
    ui.props
      .filter(([view, prop]) => view === progress && prop === 'translateX')
      .map(([, , value]) => value);

  ui.ui.frame(0);
  ui.ui.frame(25_000);
  ui.ui.frame(50_000);
  await settle();

  const [, quarter, half] = moved().slice(-3).map(Number);

  assert.ok(Math.abs(quarter - -210) < 1, String(quarter));
  assert.ok(Math.abs(half - -140) < 1, String(half));
  assert.deepEqual(app.host.__kuito.stats().total, before, 'the JS thread did nothing');
  assert.equal(ui.sent.length, sent, 'and heard nothing from the UI thread');
});

test('the Lab’s swipe-away card and pinch-to-zoom poster run with no JS handler or round trip', async () => {
  const app = await launch({ ui: true });

  await app.press('tab-lab.press');

  const ui = present(app.uiThread, 'the UI thread');
  const gestureOf = (id: string) =>
    (present(app.views.get(id), id).props.gestures as { tag: number }[])[0];
  const send = (id: string, payload: object) =>
    ui.ui.event(
      handleOf(app.host.__kuito, id),
      'gesture',
      JSON.stringify({
        handlerTag: gestureOf(id).tag,
        numberOfPointers: 1,
        pointerType: 0,
        ...payload,
      }),
    );
  const shown = (id: string, prop: string) => {
    const view = handleOf(app.host.__kuito, id);
    const written = ui.props.filter(([at, name]) => at === view && name === prop);

    return written.length ? Number(written[written.length - 1][2]) : undefined;
  };
  const before = app.host.__kuito.stats().total;
  const sent = ui.sent.length;

  send('lab-swipe', { state: 4, oldState: 2 });
  send('lab-swipe', { state: 4, translationX: 150 });
  assert.equal(shown('lab-swipe', 'translateX'), 150, 'the card follows the finger');
  assert.ok(Number(shown('lab-swipe', 'opacity')) < 1, 'and fades as it goes');

  send('lab-swipe', { state: 5, oldState: 4, velocityX: 1500 });
  for (let now = 0; now <= 3000; now += 1000 / 60) ui.ui.frame(now);
  assert.equal(shown('lab-swipe', 'translateX'), 420, 'a throw sends it away');

  send('lab-zoom', { state: 4, oldState: 2 });
  send('lab-zoom', { state: 4, scale: 2 });
  assert.equal(shown('lab-zoom', 'scale'), 2, 'the poster zooms with the pinch');

  send('lab-zoom', { state: 5, oldState: 4, velocity: 0 });
  for (let now = 3000; now <= 6000; now += 1000 / 60) ui.ui.frame(now);
  assert.equal(shown('lab-zoom', 'scale'), 1, 'and springs back');

  await settle();
  assert.equal(ui.sent.length, sent, 'the UI thread sent nothing');

  assert.equal(
    app.host.__kuito.stats().total.uiMessages,
    before.uiMessages,
    'no __kuito.ui round trip',
  );
});
