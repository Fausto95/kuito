import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { DeviceMessage, ServerMessage } from '../protocol/dev-link.ts';
import { parseDeviceMessage } from './device-messages.ts';
import {
  createServer,
  STATUS_CODES,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { admission, listenable, REFUSED, TOKEN_LENGTH } from './dev-auth.ts';
import { projectFile } from './project-file.ts';
import type { Duplex } from 'node:stream';
import { EventEmitter } from 'node:events';
import { dirname, join } from 'node:path';
import { Symbolicator } from './symbolicate.ts';
import { bundleKernel, bundleUIKernel } from './kernel.ts';
import { componentsHtml, componentsScript } from './components-page.ts';
import {
  InspectorProxy,
  deviceFromQuery,
  devtoolsSourceMap,
  type InspectorSocket,
} from './inspector-proxy.ts';

/** A WebSocket as the hub uses it. */
interface PatchClient {
  readyState: number;
  send(data: string): void;
  close(): void;
  once(event: 'close', listener: () => void): unknown;
  on(event: 'message', listener: (data: unknown) => void): unknown;
}

/** A device console entry, located at its first app frame. */
export interface ConsoleEntry {
  level: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

/** A source position a device asked to open; `file` is relative to the project. */
export interface EditorLocation {
  file: string;
  line: number;
  column: number;
}

/** A device on the Live Patch link, as its `hello` names it. */
export interface DeviceLink {
  id: string;
  name: string;
  platform: string;
}

/** A device's answer to a patch: it evaluated it, or evaluating it failed. */
export type PatchAck = { device: DeviceLink; revision: number } & (
  | { ok: true; ms: number }
  | { ok: false; code: string; message: string }
);

/** A compiled revision, as the compiler returns it. */
export interface Patch {
  path: string;
  code: string;
  map?: string | null;
  revision: number;
  /** The UI bundle's map, and the URL its stacks name it by. */
  uiMap?: string;
  uiUrl?: string;
}

interface HubEvents {
  patch: [revision: number];
  console: [entry: ConsoleEntry];
  open: [location: EditorLocation];
  device: [event: { connected: boolean; device: DeviceLink }];
  ack: [ack: PatchAck];
  /** A shell's answer to `record`: its recording (.krec, base64) and native view tree. */
  recording: [event: { device: DeviceLink; recording: string; tree: string }];
  error: [error: Error];
}

/** Instructions the CLI sends to dev shells. */
export type DevCommand = 'devtools' | 'record';

type SourcePatch = Extract<ServerMessage, { type: 'patch' }>;

/** Before its `hello` arrives, a device is known only as a connection. */
const UNNAMED: DeviceLink = { id: '', name: 'a device', platform: '' };

function send(client: PatchClient, message: ServerMessage) {
  client.send(JSON.stringify(message));
}

/**
 * Development-only source patch transport. JS is evaluated on each device;
 * devices send back console entries to symbolicate and frames to open.
 */
export class DevicePatchHub extends EventEmitter<HubEvents> {
  clients: Set<PatchClient>;
  /** Each connected device, once it has said who it is. */
  devices: Map<PatchClient, DeviceLink>;
  last: SourcePatch | null;
  closed: boolean;
  symbols: Symbolicator;
  /** Each patch's file by the URL the device evaluates it as, for DevTools. */
  files: Map<string, string>;

  constructor({ root = process.cwd() }: { root?: string } = {}) {
    super();
    this.clients = new Set();
    this.devices = new Map();
    this.last = null;
    this.closed = false;
    this.symbols = new Symbolicator({ root });
    this.files = new Map();
  }

  /** Sends a compiled revision to every device; a device that connects later gets it then. */
  patch({ path, code, map, revision, uiMap, uiUrl }: Patch) {
    if (this.closed) throw new Error('Kuito device patch hub is closed');

    this.last = { type: 'patch', revision, source: code };
    this.files.set(`kuito://patch/${revision}`, path);
    // The app a shell starts with is built from the same source.
    this.files.set('kuito://app', path);

    if (map) {
      this.symbols.remember(`kuito://patch/${revision}`, map, dirname(path));
      // The app a shell starts with is built from the same source; best effort.
      this.symbols.remember('kuito://app', map, dirname(path));
    }

    // UI-thread functions throw from the UI bundle; its map's sources are absolute.
    if (uiMap && uiUrl) this.symbols.remember(uiUrl, uiMap, dirname(path));

    let delivered = 0;

    for (const client of this.clients)
      if (client.readyState === 1) {
        send(client, this.last);
        delivered++;
      }

    this.emit('patch', revision);

    return { revision, delivered };
  }

  /** A one-shot instruction for the connected dev shells, like opening the devtools. */
  command(name: DevCommand) {
    for (const client of this.clients)
      if (client.readyState === 1) send(client, { type: 'command', name });
  }

  attach(client: PatchClient) {
    if (this.closed) throw new Error('Kuito device patch hub closed');
    this.clients.add(client);
    if (this.last) send(client, this.last);

    client.once('close', () => {
      const device = this.devices.get(client);

      this.clients.delete(client);
      this.devices.delete(client);
      if (device) this.emit('device', { connected: false, device });
    });

    client.on('message', (data) => this.#receive(client, String(data)));
  }

  #receive(client: PatchClient, data: string) {
    let message: DeviceMessage;

    try {
      message = parseDeviceMessage(data);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return void this.emit('error', new Error(`Device message rejected: ${reason}`));
    }

    receive(this, client, message);
  }

  hello(client: PatchClient, { id, name, platform }: DeviceLink) {
    const device = { id, name, platform };

    this.devices.set(client, device);
    this.emit('device', { connected: true, device });
  }

  ack(ack: PatchAck) {
    this.emit('ack', ack);
  }

  deviceOf(client: PatchClient) {
    return this.devices.get(client) ?? UNNAMED;
  }

  /** Prints the entry where it was logged; an entry with an id gets its frames back. */
  log(client: PatchClient, { id, level, message, stack }: Extract<DeviceMessage, { type: 'log' }>) {
    const { frames, codeFrame } = this.symbols.symbolicate(stack);
    const origin = frames.find((frame) => frame.kind === 'app' && frame.file);

    this.emit('console', {
      level,
      message,
      ...(origin && { file: origin.file, line: origin.line, column: origin.column }),
    });

    if (id !== undefined && client.readyState === 1)
      send(client, { type: 'symbolicated', id, frames, codeFrame });
  }

  open({ file, line, column }: EditorLocation) {
    this.emit('open', { file, line, column });
  }

  close() {
    this.closed = true;
    for (const client of this.clients) client.close();
    this.clients.clear();
  }
}

type Handlers = {
  [T in DeviceMessage['type']]: (
    hub: DevicePatchHub,
    client: PatchClient,
    message: Extract<DeviceMessage, { type: T }>,
  ) => void;
};

const DEVICE_MESSAGES: Handlers = {
  hello: (hub, client, message) => hub.hello(client, message),
  log: (hub, client, message) => hub.log(client, message),
  open: (hub, _client, message) => hub.open(message),
  applied: (hub, client, { revision, ms }) =>
    hub.ack({ device: hub.deviceOf(client), revision, ok: true, ms }),
  rejected: (hub, client, { revision, code, message }) =>
    hub.ack({ device: hub.deviceOf(client), revision, ok: false, code, message }),
  recording: (hub, client, { recording, tree }) =>
    hub.emit('recording', { device: hub.deviceOf(client), recording, tree }),
};

function receive<T extends DeviceMessage['type']>(
  hub: DevicePatchHub,
  client: PatchClient,
  message: Extract<DeviceMessage, { type: T }>,
) {
  const handle: Handlers[T] = DEVICE_MESSAGES[message.type];

  handle(hub, client, message);
}

type Respond = (status: number, type: string, body: string) => void;

/** The dev server's HTTP endpoints: DevTools discovery, as Chrome serves it, and the Components panel. */
function inspectorRoutes(
  proxy: InspectorProxy,
): Record<string, (url: URL, respond: Respond) => void> {
  const json = (respond: Respond, value: unknown) =>
    respond(200, 'application/json', JSON.stringify(value));
  const list = (_url: URL, respond: Respond) => json(respond, proxy.pages());

  return {
    '/json': list,
    '/json/list': list,
    '/json/version': (_url, respond) =>
      json(respond, { Browser: 'Kuito/Hermes', 'Protocol-Version': '1.3' }),
    '/components/panel.js': (_url, respond) =>
      void componentsScript().then(
        (code) => respond(200, 'text/javascript', code),
        (error: unknown) => respond(500, 'text/plain', String(error)),
      ),
  };
}

const PANEL_PATH = '/components/';

/** `/components/<page>`: the Components panel for a target `/json/list` names. */
function panelPage(proxy: InspectorProxy, token: string, url: URL, respond: Respond): void {
  const id = decodeURIComponent(url.pathname.slice(PANEL_PATH.length));
  const page = proxy.pages().find((each) => each.id === id);

  if (!page) return respond(404, 'text/plain', `No Kuito app is running ${id}`);

  respond(200, 'text/html; charset=utf-8', componentsHtml(page.id, page.title, token));
}

/**
 * The source map of a script as Hermes names it: a Live Patch's URL, or, for
 * the bundled bytecode, the project file it was compiled from.
 */
function scriptSourceMap(hub: DevicePatchHub, root: string, script: string): string | undefined {
  const remembered = hub.symbols.sourceMap(script);

  if (remembered) return devtoolsSourceMap(remembered.map, remembered.directory);

  const map = script.endsWith('.js') ? projectFile(root, script + '.map') : undefined;

  if (!projectFile(root, script) || !map) return undefined;

  return devtoolsSourceMap(readFileSync(map, 'utf8'), dirname(script));
}

/**
 * The source of a script as Hermes names it, which its agent cannot give
 * DevTools: a patch's file, the kernels as this build bundles them, a UI
 * bundle written beside the patches (src/dev/compiler.ts), or a project file.
 */
function scriptSources(hub: DevicePatchHub, root: string) {
  const kernels: Record<string, () => Promise<string>> = {
    'kuito://bootstrap': () => bundleKernel(),
    'kuito://ui-kernel': () => bundleUIKernel(),
  };
  const built = new Map<string, Promise<string>>();
  const read = (file: string | undefined) =>
    file ? readFile(file, 'utf8').catch(() => undefined) : Promise.resolve(undefined);

  return (script: string): Promise<string | undefined> => {
    const kernel = kernels[script];

    if (kernel) {
      const source = built.get(script) ?? kernel();

      built.set(script, source);

      return source;
    }

    const latest = hub.files.get('kuito://app');
    const ui = /^kuito:\/\/ui\/([0-9a-f]+)$/.exec(script)?.[1];

    if (ui) return read(latest && join(dirname(latest), `ui-${ui}.js`));

    return read(hub.files.get(script) ?? projectFile(root, script));
  };
}

/** Sockets that attach to a target by page id: a DevTools window, or a Components panel. */
const CLIENT_PATHS: Record<
  string,
  (proxy: InspectorProxy, client: InspectorSocket, page: string) => void
> = {
  '/inspector/debug/': (proxy, client, page) => proxy.attachDebugger(client, page),
  '/inspector/components/': (proxy, client, page) => proxy.attachComponents(client, page),
};
// A frontend can ask for a whole bundle's source or a heap snapshot in one message.
const INSPECTOR_PAYLOAD = 512 * 1024 * 1024;

async function listen(server: Server, port: number, host: string) {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
    server.listen(port, host);
  });

  const bound = server.address();

  // Listening anywhere wider than asked would expose the server past its token's reach.
  if (!bound || typeof bound === 'string' || bound.address !== host)
    throw new Error(`The dev server asked for ${host} and listens on ${JSON.stringify(bound)}`);
}

function listeningPort(server: Server) {
  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('The dev server has no TCP address');

  return address.port;
}

/**
 * The dev server: on loopback for simulators, emulators, adb-reversed phones
 * and the DevTools frontends, and on `tunnel`, a paired iPhone's CoreDevice
 * tunnel address, when there is one (docs/phone-live-patch.md). Every request
 * on either must carry `token` (src/dev/dev-auth.ts): a local process or a web
 * page could otherwise drive the debugger, read project files or the bundle.
 */
export async function startDevicePatchServer({
  port = 8765,
  bind = '127.0.0.1',
  root = process.cwd(),
  token,
  tunnel,
}: {
  port?: number;
  bind?: string;
  root?: string;
  token: string;
  tunnel?: string;
}) {
  if (bind !== '127.0.0.1' && bind !== '::1')
    throw new Error('Device patch server is loopback-only');

  if (tunnel !== undefined) listenable(tunnel);

  if (token.length < TOKEN_LENGTH)
    throw new Error(`The dev server's token must be at least ${TOKEN_LENGTH} characters`);

  const { WebSocketServer } = await import('ws');
  const hub = new DevicePatchHub({ root });
  // A recording rides the link as base64: up to the shell's 32 MB limit, a third more.
  const patches = new WebSocketServer({ noServer: true, maxPayload: 48 * 1024 * 1024 });
  const inspectors = new WebSocketServer({ noServer: true, maxPayload: INSPECTOR_PAYLOAD });
  let host = '';
  const proxy = new InspectorProxy({
    get host() {
      return host;
    },
    token,
    sourceMap: (script) => scriptSourceMap(hub, root, script),
    scriptSource: scriptSources(hub, root),
    onError: (error) => hub.emit('error', error),
  });
  const routes = inspectorRoutes(proxy);
  const serve = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const route = routes[url.pathname];
    const respond: Respond = (status, type, body) =>
      response.writeHead(status, { 'Content-Type': type }).end(body);

    if (route) route(url, respond);
    else if (url.pathname.startsWith(PANEL_PATH)) panelPage(proxy, token, url, respond);
    else respond(404, 'text/plain', 'Not found');
  };

  // Inspector sockets have their own paths; every other path is the Live Patch link.
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/inspector/device')
      return inspectors.handleUpgrade(request, socket, head, (client) => {
        try {
          proxy.attachDevice(client, deviceFromQuery(url.searchParams));
        } catch (error) {
          client.close(1008, error instanceof Error ? error.message : String(error));
        }
      });

    const clients = Object.entries(CLIENT_PATHS).find(([path]) => url.pathname.startsWith(path));

    if (clients) {
      const [path, attach] = clients;

      return inspectors.handleUpgrade(request, socket, head, (client) =>
        attach(proxy, client, decodeURIComponent(url.pathname.slice(path.length))),
      );
    }

    patches.handleUpgrade(request, socket, head, (client) => hub.attach(client));
  };
  const guarded = () =>
    createServer((request, response) => {
      const status = admission(request, token);

      if (status === 200) serve(request, response);
      else response.writeHead(status, { 'Content-Type': 'text/plain' }).end(REFUSED[status]);
    }).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const status = admission(request, token);

      // Refused before the upgrade, so the link sends nothing: not even the bundle's replay.
      if (status === 200) upgrade(request, socket, head);
      else
        socket.end(
          `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n${REFUSED[status]}`,
        );
    });
  const server = guarded();
  const phone = tunnel ? guarded() : null;
  const servers = phone ? [server, phone] : [server];

  try {
    await listen(server, port, bind);

    // The tunnel takes loopback's port, so the phone's URL differs only in the host.
    if (phone && tunnel) await listen(phone, listeningPort(server), tunnel);
  } catch (error) {
    hub.close();
    for (const each of servers) each.close();

    throw error;
  }

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('The dev server has no TCP address');
  host = `${bind === '::1' ? '[::1]' : bind}:${address.port}`;

  return {
    hub,
    proxy,
    address,
    /** `host:port` DevTools reaches the dev server at. */
    host,
    async close() {
      hub.close();
      for (const client of inspectors.clients) client.terminate();

      await Promise.all(
        servers.map((each) => {
          each.closeAllConnections();

          return new Promise((resolve) => each.close(resolve));
        }),
      );
    },
  };
}
