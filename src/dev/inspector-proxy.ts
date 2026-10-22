// The dev server's side of debugging (docs/devtools.md): devices announce their
// Hermes runtimes as targets over one socket each, DevTools frontends attach to
// a target by page id, and CDP flows between them unchanged except for source
// maps, which the dev server inlines. Beside each DevTools window, a Components
// panel exchanges its own messages with the kernel.
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One inspectable runtime on a device, as the device names it. */
export interface DeviceTarget {
  id: string;
  title: string;
}

/** A device's inspector socket names it in its URL. `id` is stable across launches. */
export interface InspectorDevice {
  id: string;
  name: string;
  app: string;
}

export type DeviceFrame =
  | { type: 'targets'; targets: DeviceTarget[] }
  | { type: 'cdp' | 'panel'; target: string; message: string };

export type ProxyFrame =
  | { type: 'connect'; target: string }
  | { type: 'disconnect'; target: string }
  | { type: 'cdp' | 'panel'; target: string; message: string };

/** A target as `/json/list` describes it to DevTools and chrome://inspect. */
export interface InspectorPage {
  id: string;
  title: string;
  description: string;
  type: 'node';
  vm: 'Hermes';
  deviceName: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl: string;
}

/** A WebSocket as the proxy uses it. */
export interface InspectorSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown) => void): unknown;
  once(event: 'close', listener: () => void): unknown;
}

interface ProxyOptions {
  /** `host:port` DevTools reaches the dev server at. */
  host: string;
  /** The session token, which a frontend sends in its socket's URL: it can set no header. */
  token: string;
  /** The source map, as DevTools should read it, of the script Hermes names `script`. */
  sourceMap?: (script: string) => string | undefined;
  /** The source of a script Hermes names `script`: its agent keeps none to give DevTools. */
  scriptSource?: (script: string) => Promise<string | undefined>;
  onError?: (error: Error) => void;
}

// Frames are fields joined by U+001F, as native events are (docs/events.md):
// the device never parses JSON, and a CDP message, the last field, is never
// re-encoded on the way through.
const SEPARATOR = '\u001f';
const OPEN = 1;

const isTarget = (value: unknown): value is DeviceTarget =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'title' in value &&
  typeof value.title === 'string';

function parseTargets(data: string): DeviceTarget[] {
  const at = data.indexOf(SEPARATOR);
  let targets: unknown;

  try {
    targets = at < 0 ? null : JSON.parse(data.slice(at + 1));
  } catch {
    targets = null;
  }

  if (!Array.isArray(targets) || !targets.every(isTarget))
    throw new Error('Malformed targets frame');

  return targets.map(({ id, title }) => ({ id, title }));
}

/** Splits off the frame's type and target; the rest is the CDP message, separators included. */
function split(data: string): [string, string | undefined, string | undefined] {
  const first = data.indexOf(SEPARATOR);

  if (first < 0) return [data, undefined, undefined];

  const second = data.indexOf(SEPARATOR, first + 1);

  if (second < 0) return [data.slice(0, first), data.slice(first + 1), undefined];

  return [data.slice(0, first), data.slice(first + 1, second), data.slice(second + 1)];
}

function message(type: 'cdp' | 'panel', data: string): DeviceFrame {
  const [, target, body] = split(data);

  if (!target || body === undefined) throw new Error(`Malformed ${type} frame`);

  return { type, target, message: body };
}

const DEVICE_FRAMES: Record<string, (data: string) => DeviceFrame> = {
  targets: (data) => ({ type: 'targets', targets: parseTargets(data) }),
  cdp: (data) => message('cdp', data),
  // The Components panel's messages (src/runtime/devtools-protocol.ts).
  panel: (data) => message('panel', data),
};

export function parseDeviceFrame(data: string): DeviceFrame {
  const [type] = split(data);
  const parse = DEVICE_FRAMES[type];

  if (!parse) throw new Error(`Unknown device frame "${type}"`);

  return parse(data);
}

export function encodeProxyFrame(frame: ProxyFrame): string {
  return frame.type === 'cdp' || frame.type === 'panel'
    ? [frame.type, frame.target, frame.message].join(SEPARATOR)
    : [frame.type, frame.target].join(SEPARATOR);
}

export function deviceFromQuery(query: URLSearchParams): InspectorDevice {
  const id = query.get('device');

  if (!id) throw new Error('An inspector device must send its device id');

  return { id, name: query.get('name') || id, app: query.get('app') || '' };
}

/**
 * Chrome's own frontend, bundled with every Chromium browser: nothing to ship
 * or download, and it always matches the browser it runs in. js_app is its
 * JavaScript-only layout (Sources, Console, Memory, Performance), as for Node.
 */
export function frontendUrl(host: string, pageId: string, token: string): string {
  const ws = encodeURIComponent(
    `${host}/inspector/debug/${pageId}?token=${encodeURIComponent(token)}`,
  );

  return `devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=${ws}`;
}

/** `map` with each source as an absolute file URL: stable across Live Patches, so breakpoints carry over. */
export function devtoolsSourceMap(map: string, directory: string): string {
  const parsed: { sources?: unknown; sourceRoot?: unknown } = JSON.parse(map);
  const root = typeof parsed.sourceRoot === 'string' ? parsed.sourceRoot : '';
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  return JSON.stringify({
    ...parsed,
    sourceRoot: undefined,
    sources: sources.map((source) =>
      typeof source === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(source)
        ? pathToFileURL(isAbsolute(source) ? source : resolve(directory, root, source)).href
        : source,
    ),
  });
}

interface Device {
  info: InspectorDevice;
  socket: InspectorSocket;
  targets: DeviceTarget[];
}

interface Debugger {
  device: Device;
  target: string;
  socket: InspectorSocket;
  /** Script URLs by script id, as the target announced them. */
  scripts: Map<string, string>;
}

const pageId = (device: InspectorDevice, target: string) => `${device.id}-${target}`;

export class InspectorProxy {
  #options: ProxyOptions;
  #devices = new Map<string, Device>();
  /** By page id: one frontend per target. */
  #debuggers = new Map<string, Debugger>();
  /** By page id: one Components panel per target, beside its DevTools window. */
  #panels = new Map<string, { device: Device; target: string; socket: InspectorSocket }>();

  constructor(options: ProxyOptions) {
    this.#options = options;
  }

  pages(): InspectorPage[] {
    const { host, token } = this.#options;

    return [...this.#devices.values()].flatMap(({ info, targets }) =>
      targets.map(({ id, title }) => {
        const page = pageId(info, id);

        return {
          id: page,
          title: `${title} · ${info.name}`,
          description: info.app,
          type: 'node' as const,
          vm: 'Hermes' as const,
          deviceName: info.name,
          webSocketDebuggerUrl: `ws://${host}/inspector/debug/${page}?token=${encodeURIComponent(token)}`,
          devtoolsFrontendUrl: frontendUrl(host, page, token),
        };
      }),
    );
  }

  /** The page for `target` on the device that connected last. */
  latest(target: string): InspectorPage | undefined {
    const devices = [...this.#devices.values()].filter(({ targets }) =>
      targets.some(({ id }) => id === target),
    );
    const device = devices[devices.length - 1];

    return device && this.pages().find(({ id }) => id === pageId(device.info, target));
  }

  attachDevice(socket: InspectorSocket, info: InspectorDevice) {
    this.#devices.get(info.id)?.socket.close(1000, 'The device connected again');

    const device: Device = { info, socket, targets: [] };

    this.#devices.set(info.id, device);
    socket.on('message', (data) => this.#receive(device, String(data)));

    socket.once('close', () => {
      if (this.#devices.get(info.id) === device) this.#devices.delete(info.id);

      for (const clients of [this.#debuggers, this.#panels])
        for (const [page, attached] of clients)
          if (attached.device === device) {
            clients.delete(page);
            attached.socket.close(1011, `${info.name} disconnected`);
          }
    });
  }

  /** The device and target behind `page`; closes `socket` with the reason when there is none. */
  #find(socket: InspectorSocket, page: string) {
    const found = [...this.#devices.values()].find(({ info, targets }) =>
      targets.some(({ id }) => pageId(info, id) === page),
    );
    const target = found?.targets.find(({ id }) => found && pageId(found.info, id) === page);

    if (found && target) return { found, target };
    socket.close(1011, `No Kuito app is running ${page}`);
  }

  /**
   * A Components panel: one JSON object per message
   * (src/runtime/devtools-protocol.ts), to and from the kernel's backend,
   * beside any DevTools window.
   */
  attachComponents(socket: InspectorSocket, page: string) {
    const match = this.#find(socket, page);

    if (!match) return;

    const { found, target } = match;

    this.#panels.get(page)?.socket.close(1000, 'Another Components panel opened this target');

    const panel = { device: found, target: target.id, socket };

    this.#panels.set(page, panel);

    socket.on('message', (data) => {
      if (this.#panels.get(page) === panel)
        this.#toDevice(found, { type: 'panel', target: target.id, message: String(data) });
    });

    socket.once('close', () => {
      if (this.#panels.get(page) !== panel) return;
      this.#panels.delete(page);
      this.#toDevice(found, { type: 'panel', target: target.id, message: '{"event":"shutdown"}' });
    });
  }

  attachDebugger(socket: InspectorSocket, page: string) {
    const match = this.#find(socket, page);

    if (!match) return;

    const { found, target } = match;

    const previous = this.#debuggers.get(page);

    if (previous) {
      this.#debuggers.delete(page);
      previous.socket.close(1000, 'Another DevTools window opened this target');
      this.#toDevice(previous.device, { type: 'disconnect', target: previous.target });
    }

    const attached: Debugger = { device: found, target: target.id, socket, scripts: new Map() };

    this.#debuggers.set(page, attached);
    this.#toDevice(found, { type: 'connect', target: target.id });

    socket.on('message', (data) => {
      if (this.#debuggers.get(page) !== attached) return;

      const message = String(data);
      const forward = () => {
        if (this.#debuggers.get(page) === attached)
          this.#toDevice(found, { type: 'cdp', target: target.id, message });
      };

      if (!message.includes('"Debugger.getScriptSource"')) return forward();
      void this.#answer(attached, message).then((answered) => answered || forward());
    });

    socket.once('close', () => {
      if (this.#debuggers.get(page) !== attached) return;
      this.#debuggers.delete(page);
      this.#toDevice(found, { type: 'disconnect', target: target.id });
    });
  }

  #receive(device: Device, data: string) {
    let frame: DeviceFrame;

    try {
      frame = parseDeviceFrame(data);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      this.#options.onError?.(
        new Error(`${device.info.name} sent a malformed inspector frame: ${reason}`),
      );

      return;
    }

    if (frame.type === 'targets') {
      device.targets = frame.targets;
      return;
    }

    if (frame.type === 'panel') {
      const panel = this.#panels.get(pageId(device.info, frame.target));

      if (panel?.device === device && panel.socket.readyState === OPEN)
        panel.socket.send(frame.message);

      return;
    }

    const attached = this.#debuggers.get(pageId(device.info, frame.target));

    if (attached?.device === device && attached.socket.readyState === OPEN)
      attached.socket.send(this.#rewrite(attached, frame.message));
  }

  /** Answers `Debugger.getScriptSource` for the scripts the dev server has; false: the device's to answer. */
  async #answer(attached: Debugger, message: string): Promise<boolean> {
    const { scriptSource } = this.#options;

    if (!scriptSource) return false;

    const command: { id?: unknown; method?: unknown; params?: { scriptId?: unknown } } =
      JSON.parse(message);
    const url = attached.scripts.get(String(command.params?.scriptId));
    const source =
      url && command.method === 'Debugger.getScriptSource' && (await scriptSource(url));

    if (typeof source !== 'string' || attached.socket.readyState !== OPEN) return false;

    attached.socket.send(JSON.stringify({ id: command.id, result: { scriptSource: source } }));

    return true;
  }

  /**
   * Gives each script the dev server has a map for that map inline, as a data
   * URL: every frontend reads those without fetching, whatever origin it is
   * served from. Other messages pass verbatim.
   */
  #rewrite(attached: Debugger, message: string): string {
    if (!message.includes('"Debugger.scriptParsed"')) return message;

    const parsed: {
      method?: unknown;
      params?: { scriptId?: unknown; url?: unknown; sourceMapURL?: unknown };
    } = JSON.parse(message);
    const script = parsed.params?.url;

    if (parsed.method !== 'Debugger.scriptParsed' || typeof script !== 'string') return message;

    attached.scripts.set(String(parsed.params?.scriptId), script);

    const map = this.#options.sourceMap?.(script);

    if (!map) return message;

    const sourceMapURL =
      'data:application/json;charset=utf-8;base64,' + Buffer.from(map).toString('base64');

    return JSON.stringify({ ...parsed, params: { ...parsed.params, sourceMapURL } });
  }

  #toDevice(device: Device, frame: ProxyFrame) {
    if (device.socket.readyState === OPEN) device.socket.send(encodeProxyFrame(frame));
  }
}
