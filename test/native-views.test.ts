import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { flushed, installKernel, type Props } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';

// Views a native module contributes, linked by their spec's stubs
// (src/runtime/link.ts): the stub binds the view to its id, the events it
// emits and its methods, each a linked main-thread function whose first
// argument is the view's number.

/** What the kernel installs for the host to settle a call with. */
interface LinkCallbacks {
  __kuitoLinkSettle(call: number, value: unknown): void;
  __kuitoLinkFail(call: number, code: string, message: string): void;
}

type Handle = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const SLIDER = 11;
const CAMERA = 21;
const TAKE_PICTURE = 22;
const PAUSE_PREVIEW = 23;

function platform() {
  const registered: number[] = [];
  const calls: { id: number; call: number; args: unknown[] }[] = [];
  const views = new Map<string, { kind: string; parent: string; props: Props }>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      __kuitoHostCall(id: number) {
        registered.push(id);

        return null;
      },
      __kuitoHostCallAsync(id: number, call: number, ...args: unknown[]) {
        calls.push({ id, call, args: data(args) as unknown[] });
      },
    }),
  );
  const callbacks = host as typeof host & LinkCallbacks;

  return {
    kuito: host.__kuito,
    jsx: host.__kuitoJSX,
    views,
    registered,
    calls,
    settle: (call: number, value: unknown) => callbacks.__kuitoLinkSettle(call, value),
    fail: (call: number, code: string, message: string) =>
      callbacks.__kuitoLinkFail(call, code, message),
  };
}

type Platform = ReturnType<typeof platform>;

/** The kind Slider's stub links: a view that emits change and changeEnd, with no methods. */
const linkSlider = (native: Platform) =>
  native.kuito.linkView(SLIDER, 'Slider', ['change', 'changeEnd'], {});

/** The kind Camera's stub links, with its two methods. */
const linkCamera = (native: Platform) =>
  native.kuito.linkView(CAMERA, 'Camera', ['ready'], {
    takePicture: native.kuito.link(TAKE_PICTURE, 'Camera.takePicture', 'main', [
      'n',
      ['?', ['o', [['quality', 'n']]]],
    ]),
    pausePreview: native.kuito.link(PAUSE_PREVIEW, 'Camera.pausePreview', 'main', ['n']),
  });

/** Renders a Camera view with a ref and returns the ref. */
function renderCamera(native: Platform) {
  const Camera = linkCamera(native);
  const ref: { current: Handle | null } = { current: null };

  native.kuito.patch('screen', (api) =>
    api.render(
      native.jsx('VStack', { id: 'root' }, native.jsx(Camera, { id: 'camera', ref, height: 300 })),
    ),
  );

  return ref;
}

test('linking a native view names its kind and crosses nothing', () => {
  const native = platform();

  assert.equal(linkSlider(native), 'module:Slider');
  assert.deepEqual(native.registered, []);

  assert.throws(
    () => native.kuito.linkView(SLIDER, 'Slider', ['change'], { seek: 'not a function' }),
    /Invalid module view stub/,
  );
});

test('a native view mounts as its module kind, with its props and style props', () => {
  const native = platform();
  const Slider = linkSlider(native);

  native.kuito.patch('screen', (api) =>
    api.render(
      native.jsx(
        'VStack',
        { id: 'root' },
        native.jsx(Slider, { id: 'volume', value: 0.25, height: 40, range: { min: 0, max: 1 } }),
      ),
    ),
  );

  const view = present(native.views.get('volume'), 'volume');

  assert.equal(view.kind, 'module:Slider');
  assert.equal(view.parent, 'root');
  assert.deepEqual(view.props, { value: 0.25, height: 40, range: { min: 0, max: 1 } });
});

test('a native view registers its kind natively once, when it first renders', () => {
  const native = platform();
  const Slider = linkSlider(native);

  native.kuito.patch('screen', (api) => api.render(native.jsx(Slider, { id: 'volume' })));

  native.kuito.patch('screen', (api) =>
    api.render(
      native.jsx(
        'VStack',
        { id: 'root' },
        native.jsx(Slider, { id: 'volume' }),
        native.jsx(Slider, { id: 'balance' }),
      ),
    ),
  );

  assert.deepEqual(native.registered, [SLIDER]);
});

test('a reactive prop of a native view updates only that prop', async () => {
  const native = platform();
  const Slider = linkSlider(native);
  let set: (value: number) => void = () => {};

  native.kuito.patch('screen', (api) => {
    const value = api.state('value', 0.1);

    set = (next) => {
      value.value = next;
    };

    api.render(native.jsx(Slider, { id: 'volume', value: () => value.value, height: 40 }));
  });

  set(0.75);
  await flushed();

  const view = present(native.views.get('volume'), 'volume');

  assert.equal(view.props.value, 0.75);
  assert.equal(view.props.height, 40);
});

test('on* props listen to the events the view declares', () => {
  const native = platform();
  const Slider = linkSlider(native);
  const seen: unknown[] = [];

  native.kuito.patch('screen', (api) =>
    api.render(
      native.jsx(Slider, {
        id: 'volume',
        onChange: (value: unknown) => seen.push(['change', value]),
        onChangeEnd: (event: { value: unknown }) => seen.push(['complete', event.value]),
      }),
    ),
  );

  const props = present(native.views.get('volume'), 'volume').props;

  assert.equal('onChange' in props, false, 'handlers stay in JavaScript');

  nativeEvent(native.kuito, 'volume.change\u001f{"value":0.5}');
  nativeEvent(native.kuito, 'volume.changeEnd\u001f{"value":0.5}');

  assert.deepEqual(seen, [
    ['change', 0.5],
    ['complete', 0.5],
  ]);
});

test("a view's events reach its element's listeners, with or without an on* prop", () => {
  const native = platform();
  const ref = renderCamera(native);
  const seen: string[] = [];
  const element = present(ref.current, 'camera') as unknown as {
    addEventListener(type: string, listener: (event: { type: string }) => void): void;
    removeEventListener(type: string, listener: (event: { type: string }) => void): void;
  };
  const listener = (event: { type: string }) => seen.push(event.type);

  element.addEventListener('ready', listener);
  nativeEvent(native.kuito, 'camera.ready');
  element.removeEventListener('ready', listener);
  nativeEvent(native.kuito, 'camera.ready');

  assert.deepEqual(seen, ['ready']);
});

test('an event the view does not declare is an error that lists the ones it does', () => {
  const native = platform();
  const Slider = linkSlider(native);

  assert.throws(
    () =>
      native.kuito.patch('screen', (api) =>
        api.render(native.jsx(Slider, { id: 'volume', onLoad: () => {} })),
      ),
    /Slider does not emit "load"\. It emits: change, changeEnd/,
  );
});

test('a module kind no stub linked cannot render', () => {
  const native = platform();

  assert.throws(
    () => native.kuito.patch('screen', (api) => api.render(native.jsx('module:Camera', {}))),
    /Native module Camera has no linked view\. Render the `view` its spec declares/,
  );

  assert.deepEqual(native.registered, []);
});

test('a native view is a leaf', () => {
  const native = platform();
  const Slider = linkSlider(native);

  assert.throws(
    () =>
      native.kuito.patch('screen', (api) =>
        api.render(native.jsx(Slider, { id: 'volume' }, native.jsx('Text', { text: 'hi' }))),
      ),
    /Slider takes no children/,
  );
});

test('a native view that takes children lays them out inside it', () => {
  const native = platform();
  const Menu = native.kuito.linkView(31, 'Menu', ['select'], {}, true);

  native.kuito.patch('screen', (api) =>
    api.render(
      native.jsx(
        'VStack',
        { id: 'root' },
        native.jsx(Menu, { id: 'menu' }, native.jsx('Text', { id: 'title', text: 'hi' })),
      ),
    ),
  );

  assert.equal(native.views.get('menu')?.kind, 'module:Menu');
  assert.equal(native.views.get('title')?.parent, 'menu');

  assert.throws(
    () => native.kuito.linkView(31, 'Menu', ['select'], {}, 'yes'),
    /Invalid module view stub/,
  );
});

test("a view's methods are methods of its element, called with the view's number", async () => {
  const native = platform();
  const ref = renderCamera(native);
  const handle = present(ref.current, 'camera handle');

  assert.equal(handle.id, 'camera', 'it is still the view element');

  const picture = handle.takePicture({ quality: 0.5 });
  const call = present(native.calls[0], 'takePicture call');

  assert.deepEqual(
    { id: call.id, args: call.args },
    { id: TAKE_PICTURE, args: [handleOf(native.kuito, 'camera'), { quality: 0.5 }] },
  );

  native.settle(call.call, { uri: 'file:///cache/1.jpg', width: 4, height: 3 });

  assert.deepEqual(data(await picture), { uri: 'file:///cache/1.jpg', width: 4, height: 3 });
});

test('a view method rejects with the native error and its code', async () => {
  const native = platform();
  const handle = present(renderCamera(native).current, 'camera handle');
  const paused = handle.pausePreview();

  native.fail(present(native.calls[0], 'call').call, 'ERR_CAMERA', 'No camera');

  await assert.rejects(paused, (error: { code?: string; message?: string }) => {
    assert.equal(error.code, 'ERR_CAMERA');
    assert.match(String(error.message), /Camera\.pausePreview failed: No camera/);

    return true;
  });
});

test('a view method of a removed view rejects without crossing', async () => {
  const native = platform();
  const ref = renderCamera(native);
  const handle = present(ref.current, 'camera handle');

  native.kuito.patch('screen', (api) => api.render(native.jsx('VStack', { id: 'root' })));

  assert.equal(ref.current, null);
  await assert.rejects(handle.takePicture(), /Camera\.takePicture: the view camera is not mounted/);
  assert.deepEqual(native.calls, []);
});

test("a view method's arguments must match its schema", async () => {
  const native = platform();
  const handle = present(renderCamera(native).current, 'camera handle');

  await assert.rejects(
    handle.takePicture({ quality: 'high' }),
    /Camera\.takePicture argument 2's quality must be a finite number: high/,
  );

  await assert.rejects(handle.pausePreview(true), /Camera\.pausePreview takes 1 arguments, not 2/);

  assert.deepEqual(native.calls, []);
});

test("a view's element answers only the methods the view declares", () => {
  const native = platform();
  const Slider = linkSlider(native);
  const ref: { current: Handle | null } = { current: null };

  native.kuito.patch('screen', (api) => api.render(native.jsx(Slider, { id: 'volume', ref })));

  assert.equal(present(ref.current, 'slider handle').takePicture, undefined);
});

test("a module view's prop bound to a signal follows the payload field of its name", async () => {
  const native = platform();
  const Slider = linkSlider(native);
  let value!: { value: number };

  native.kuito.patch('screen', (api) => {
    function Screen() {
      value = native.kuito.useState(0.1);

      return native.jsx(Slider, { id: 'volume', value, height: 40 });
    }

    api.render(native.jsx(Screen, {}));
  });

  nativeEvent(native.kuito, 'volume.change\u001f{"value":0.5}');
  await flushed();

  assert.equal(value.value, 0.5);

  assert.equal(
    present(native.views.get('volume'), 'volume').props.value,
    0.1,
    'the slider moved itself: value is not sent back',
  );
});
