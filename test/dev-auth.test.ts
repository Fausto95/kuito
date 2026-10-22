import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { admission, listenable } from '../src/dev/dev-auth.ts';

const TOKEN = 'k'.repeat(43);
const request = (headers: Record<string, string>, url = '/') => ({ headers, url });
const host = { host: '127.0.0.1:8765' };

test('a client sends the session token as a bearer, in any case', () => {
  for (const scheme of ['Bearer', 'bearer', 'BEARER'])
    assert.equal(admission(request({ ...host, authorization: `${scheme} ${TOKEN}` }), TOKEN), 200);
});

test('a DevTools frontend sends the session token in its URL', () => {
  assert.equal(admission(request(host, `/inspector/debug/A1-js?token=${TOKEN}`), TOKEN), 200);
});

test('a client without the session token is refused', () => {
  assert.equal(admission(request(host), TOKEN), 401);

  assert.equal(
    admission(request({ ...host, authorization: `Bearer ${'x'.repeat(43)}` }), TOKEN),
    401,
  );

  assert.equal(admission(request({ ...host, authorization: TOKEN }), TOKEN), 401);
  assert.equal(admission(request(host, '/?token=short'), TOKEN), 401);

  assert.equal(
    admission(request({ ...host, authorization: `Bearer ${TOKEN}${'x'.repeat(1024)}` }), TOKEN),
    401,
    'an oversized header is refused before any comparison',
  );
});

test('a request named for another host is refused, against DNS rebinding', () => {
  const sent = { authorization: `Bearer ${TOKEN}` };

  for (const name of [
    'localhost:8765',
    '127.0.0.1:8765',
    '[::1]:8765',
    '10.0.2.2:8765',
    '[fdd1:2ad:47c1::2]:8790',
  ])
    assert.equal(admission(request({ ...sent, host: name }), TOKEN), 200, name);

  for (const name of ['evil.example:8765', 'evil.example', '127.0.0.1.nip.io:8765', ''])
    assert.equal(admission(request({ ...sent, host: name }), TOKEN), 403, name);
});

test('a web page cannot reach the server from its own origin', () => {
  const sent = { ...host, authorization: `Bearer ${TOKEN}` };

  assert.equal(admission(request({ ...sent, origin: 'devtools://devtools' }), TOKEN), 200);

  assert.equal(
    admission(request({ ...sent, origin: 'http://127.0.0.1:8765' }), TOKEN),
    200,
    "the server's own pages, the Components panel",
  );

  assert.equal(admission(request({ ...sent, origin: 'http://evil.example' }), TOKEN), 403);

  assert.equal(
    admission(request({ ...sent, origin: 'http://127.0.0.1:9222' }), TOKEN),
    200,
    'the DevTools frontend the dedicated Chromium serves from its debugging port',
  );

  assert.equal(admission(request({ ...sent, origin: 'http://[::1]:9222' }), TOKEN), 200);

  assert.equal(
    admission(request({ ...sent, origin: 'http://localhost.evil.example' }), TOKEN),
    403,
  );

  assert.equal(admission(request({ ...sent, origin: 'null' }), TOKEN), 403);
});

test('the dev server listens on loopback or a CoreDevice tunnel, nothing wider', () => {
  const interfaces = {
    en0: [{ address: '192.168.1.10', family: 'IPv4', internal: false }],
    utun7: [{ address: 'fdd1:2ad:47c1::2', family: 'IPv6', internal: false }],
    utun8: [{ address: '2001:db8::2', family: 'IPv6', internal: false }],
    en1: [{ address: 'fd00:1::2', family: 'IPv6', internal: false }],
  } as never;

  for (const address of ['127.0.0.1', '::1', 'fdd1:2ad:47c1::2'])
    assert.equal(listenable(address, interfaces), address, address);

  for (const address of [
    '',
    '::',
    '0.0.0.0',
    'localhost',
    '192.168.1.10',
    '2001:db8::2',
    'fd00:1::2',
    'fd00:9::2',
  ])
    assert.throws(
      () => listenable(address, interfaces),
      /listens only on loopback or a phone's tunnel/,
      address,
    );
});
