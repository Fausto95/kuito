import { createHash, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/** What admission reads of a request: its headers and its URL. */
interface Request {
  headers: { authorization?: string; host?: string; origin?: string };
  url?: string;
}

// 256 bits as base64url; a header longer than a bearer of that is not one.
export const TOKEN_LENGTH = 43;

const MAX_AUTHORIZATION = 256;

const digest = (text: string) => createHash('sha256').update(text).digest();

/** The token a request carries: a shell's bearer header, or a DevTools frontend's `?token=`. */
function sentToken({ headers, url }: Request) {
  const header = headers.authorization ?? '';

  if (header.length > MAX_AUTHORIZATION) return '';

  const bearer = /^bearer (.+)$/i.exec(header)?.[1];

  return bearer ?? new URL(url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
}

/**
 * The name a request was sent to: an IP address or localhost. Any other name
 * is a DNS rebinding page pointing its own domain at this machine.
 */
function trustedHost(host: string | undefined) {
  const name = /^\[([^\]]+)\](?::\d+)?$/.exec(host ?? '')?.[1] ?? (host ?? '').replace(/:\d+$/, '');

  return name === 'localhost' || isIP(name) !== 0;
}

// Loopback by address: the dedicated Chromium serves the DevTools frontend from its own port.
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Who opened the request: a native shell or Node sends no Origin, Chrome's
 * DevTools frontend sends devtools://devtools or the loopback address its
 * browser serves it from, and the server's own pages (the Components panel)
 * send the server's. A web page elsewhere sends its own, and WebSockets skip
 * CORS, so this keeps it from opening a socket even before the token does.
 */
const trustedOrigin = ({ origin, host }: Request['headers']) =>
  origin === undefined ||
  origin === 'devtools://devtools' ||
  origin === `http://${host}` ||
  LOOPBACK_ORIGIN.test(origin);

/**
 * 200 for a request the dev server answers, 403 for one sent by a web page or
 * to a foreign host name, 401 for one without the session token.
 */
export function admission(request: Request, token: string): 200 | 401 | 403 {
  if (!trustedHost(request.headers.host) || !trustedOrigin(request.headers)) return 403;

  return timingSafeEqual(digest(sentToken(request)), digest(token)) ? 200 : 401;
}

export const REFUSED: Record<401 | 403, string> = {
  401: 'This dev server needs the session token kuito dev launched the app with.',
  403: 'This dev server answers only its own tools, on an IP address or localhost.',
};

// Unique local addresses: CoreDevice gives each phone tunnel one.
const UNIQUE_LOCAL = new BlockList();

UNIQUE_LOCAL.addSubnet('fc00::', 7, 'ipv6');

/**
 * `address`, if the dev server may listen on it: loopback, or a unique local
 * address on a utun interface, a paired iPhone's CoreDevice tunnel. Never a
 * wildcard or the LAN: the token guards every request, and nothing else needs
 * to reach the server.
 */
export function listenable(
  address: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string {
  if (address === '127.0.0.1' || address === '::1') return address;

  const tunnel =
    isIP(address) === 6 &&
    UNIQUE_LOCAL.check(address, 'ipv6') &&
    Object.entries(interfaces).some(
      ([name, addresses]) =>
        name.startsWith('utun') && (addresses ?? []).some((each) => each.address === address),
    );

  if (!tunnel)
    throw new Error(
      `The dev server listens only on loopback or a phone's tunnel, not on '${address}'`,
    );

  return address;
}
