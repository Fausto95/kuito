import { SafeArea, Scroll, Text, VStack, signal } from 'kuito';

// The standard library end to end on a device (docs/web-apis.md): fetch (a
// PNG as an ArrayBuffer, headers, a binary body, a streamed body, an abort),
// then each other entry, what Hermes' own Intl has on this platform, and
// the formats Kuito adds to it.
// Each line also goes to the console, so `kuito dev` prints the results.

const PNG = 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png';
const ECHO = 'https://httpbin.org';

const sleep = (milliseconds: number) =>
  new Promise<void>((done) => setTimeout(() => done(), milliseconds));

/** `ok` when `actual` is what the entry must give, `FAILED` with both otherwise. */
function expect(actual: unknown, expected: unknown): string {
  const text = JSON.stringify(actual);

  return text === JSON.stringify(expected)
    ? `ok ${text}`
    : `FAILED ${text}, expected ${JSON.stringify(expected)}`;
}

function check(name: string, run: () => Promise<string>) {
  const line = signal(`${name}: …`);

  const show = (text: string) => {
    line.value = `${name}: ${text}`;
    console.log(line.value);
  };

  run().then(show, (error: Error) => show(`FAILED ${error.name}: ${error.message}`));

  return line;
}

export default function App() {
  const lines = [
    check('png', async () => {
      const response = await fetch(PNG);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const signature = [...bytes.subarray(0, 4)].map((byte) => byte.toString(16)).join(' ');

      return `${response.status} ${response.headers.get('content-type')} ${bytes.byteLength} bytes, starts ${signature}`;
    }),
    check('headers', async () => {
      const response = await fetch(`${ECHO}/headers`, { headers: { 'X-Kuito': 'phase13' } });
      const echoed = (await response.json()) as { headers: Record<string, string> };

      return `sent X-Kuito, server saw ${echoed.headers['X-Kuito']}`;
    }),
    check('binary post', async () => {
      const response = await fetch(`${ECHO}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Uint8Array.of(0, 1, 2, 255),
      });
      const echoed = (await response.json()) as { data: string };

      return `server got ${echoed.data}`;
    }),
    check('stream', async () => {
      const response = await fetch(`${ECHO}/stream-bytes/200000?chunk_size=10000`);
      let chunks = 0;
      let bytes = 0;

      await response.chunks((chunk) => {
        chunks++;
        bytes += chunk.byteLength;
      });

      return `${bytes} bytes in ${chunks} chunks`;
    }),
    check('abort', async () => {
      const controller = new AbortController();
      const pending = fetch(`${ECHO}/delay/5`, { signal: controller.signal });

      controller.abort();

      return pending.then(
        () => 'resolved?',
        (error: Error) => error.name,
      );
    }),
    check('WebSocket', async () => {
      const socket = new WebSocket('wss://echo.websocket.org');
      const echoes: unknown[] = [];

      await new Promise<void>((done, fail) => {
        socket.onopen = () => {
          socket.send('kuito');
          socket.send(Uint8Array.of(1, 2, 3));
        };
        // The server greets first; keep only the echoes.

        socket.onmessage = ({ data }) => {
          if (data === 'kuito') echoes.push(data);
          else if (data instanceof ArrayBuffer) echoes.push([...new Uint8Array(data)]);

          if (echoes.length === 2) socket.close(1000, 'done');
        };

        socket.onerror = ({ message }) => fail(new Error(message));

        socket.onclose = ({ code, wasClean }) =>
          wasClean && code === 1000 ? done() : fail(new Error(`closed ${code}`));
      });

      return expect(echoes, ['kuito', [1, 2, 3]]);
    }),
    check('setInterval', async () => {
      let ticks = 0;

      await new Promise<void>((done) => {
        const id = setInterval(() => {
          if (++ticks === 3) {
            clearInterval(id);
            done();
          }
        }, 10);
      });

      return expect(ticks, 3);
    }),
    check('queueMicrotask', async () => {
      const order: string[] = [];

      setTimeout(() => order.push('timer'), 0);
      queueMicrotask(() => order.push('microtask'));
      order.push('sync');
      await sleep(20);

      return expect(order, ['sync', 'microtask', 'timer']);
    }),
    check('performance.now', async () => {
      const start = performance.now();
      const wall = Date.now();

      await sleep(50);

      // A busy JS thread may sleep longer; the clock must still agree with the wall's.
      const elapsed = performance.now() - start;
      const drift = Math.abs(elapsed - (Date.now() - wall));

      return elapsed >= 45 && drift < 20
        ? `ok ${elapsed.toFixed(1)} ms`
        : `FAILED ${elapsed} ms, ${drift} ms off the wall clock`;
    }),
    check('URL', async () => {
      const url = new URL('../d?x=1#h', 'https://Example.com:443/a/b/c');

      url.searchParams.append('q', 'a b');

      return expect(
        [url.href, url.origin],
        ['https://example.com/a/d?x=1&q=a+b#h', 'https://example.com'],
      );
    }),
    check('TextEncoder', async () => {
      const bytes = new TextEncoder().encode('é✓😀');

      return expect([bytes.byteLength, new TextDecoder().decode(bytes)], [9, 'é✓😀']);
    }),
    check('crypto', async () => {
      const uuid = crypto.randomUUID();
      const bytes = crypto.getRandomValues(new Uint8Array(16));

      return expect(
        [/^[0-9a-f-]{36}$/.test(uuid) && uuid[14] === '4', bytes.some((byte) => byte !== 0)],
        [true, true],
      );
    }),
    check('structuredClone', async () => {
      const source: { map: Map<string, number>; when: Date; self?: unknown } = {
        map: new Map([['a', 1]]),
        when: new Date(0),
      };

      source.self = source;

      const copy = structuredClone(source);

      return expect(
        [copy !== source, copy.self === copy, copy.map.get('a'), copy.when.getTime()],
        [true, true, 1, 0],
      );
    }),
    check('Intl', async () => {
      const formatted = [
        new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(new Date(0)),
        new Intl.NumberFormat('de-DE').format(1234.5),
        new Intl.Collator('de').compare('ä', 'z') < 0,
        (1234.5).toLocaleString('en-US'),
      ];
      const kinds = [
        'getCanonicalLocales',
        'PluralRules',
        'RelativeTimeFormat',
        'ListFormat',
        'Segmenter',
        'DisplayNames',
        'Locale',
      ];
      const has = kinds.filter((kind) => kind in Intl);

      return `${expect(formatted, ['1/1/1970', '1.234,5', true, '1,234.5'])}; also has ${has.join(', ') || 'none'} of ${kinds.join(', ')}`;
    }),
    check('Intl added', async () =>
      expect(
        [
          new Intl.PluralRules('ru').select(3),
          new Intl.PluralRules('en', { type: 'ordinal' }).select(22),
          new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-1, 'day'),
          new Intl.RelativeTimeFormat('en').format(3, 'hours'),
          new Intl.ListFormat('en').format(['a', 'b', 'c']),
          new Intl.DisplayNames('en', { type: 'region' }).of('DE'),
          new Intl.DisplayNames('en', { type: 'currency' }).of('EUR'),
        ],
        ['few', 'two', 'yesterday', 'in 3 hours', 'a, b, and c', 'Germany', 'Euro'],
      ),
    ),
  ];

  return (
    <SafeArea style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <Scroll>
        <VStack style={{ padding: 16, gap: 12 }}>
          {lines.map((line) => (
            <Text>{line}</Text>
          ))}
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
