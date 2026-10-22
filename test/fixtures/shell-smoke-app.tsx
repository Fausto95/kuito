import { Text, platform } from 'kuito';

// test/shell-smoke.test.ts runs this in a built shell, offline from its
// bundled scripts: it fetches a PNG as an ArrayBuffer through the HTTP host
// from the test's server, formats with Hermes' Intl, and posts both back.

// The test's server; the Android emulator reaches the host's loopback at 10.0.2.2.
const SERVER = `http://${platform === 'android' ? '10.0.2.2' : '127.0.0.1'}:18990`;

/** What each probe gives, or the error it throws: an unsupported option shows as one. */
function probe(run: () => unknown) {
  try {
    return run();
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
}

async function png() {
  const response = await fetch(`${SERVER}/smoke.png`);
  const bytes = new Uint8Array(await response.arrayBuffer());

  return {
    status: response.status,
    type: response.headers.get('content-type'),
    length: bytes.byteLength,
    sum: bytes.reduce((sum, byte) => (sum + byte) % 65521, 0),
  };
}

function intl() {
  const epoch = new Date(0);

  return {
    number: probe(() => new Intl.NumberFormat('de-DE').format(1234.5)),
    currency: probe(() =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5),
    ),
    percent: probe(() => new Intl.NumberFormat('en-US', { style: 'percent' }).format(0.25)),
    digits: probe(() => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(1)),
    numberParts: probe(() =>
      new Intl.NumberFormat('en-US').formatToParts(1234.5).map((part) => part.type),
    ),
    numberLocale: probe(() => new Intl.NumberFormat('de-DE').resolvedOptions().locale),
    compact: probe(() => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(1234)),
    unit: probe(() =>
      new Intl.NumberFormat('en-US', { style: 'unit', unit: 'kilometer' }).format(5),
    ),
    date: probe(() => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(epoch)),
    dateStyle: probe(() =>
      new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(epoch),
    ),
    dateOptions: probe(() =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }).format(epoch),
    ),
    dateParts: probe(() =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })
        .formatToParts(epoch)
        .map((part) => part.type),
    ),
    timeZone: probe(() =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric' }).format(epoch),
    ),
    collator: probe(() => new Intl.Collator('de').compare('ä', 'z')),
    sensitivity: probe(() => new Intl.Collator('en', { sensitivity: 'base' }).compare('a', 'A')),
    canonical: probe(() => Intl.getCanonicalLocales('EN-us')),
    supported: probe(() => Intl.NumberFormat.supportedLocalesOf(['fr-FR'])),
    localeString: probe(() => (1234.5).toLocaleString('en-US')),
    dateLocale: probe(() => epoch.toLocaleDateString('en-US', { timeZone: 'UTC' })),
    compare: probe(() => 'a'.localeCompare('b')),
    upper: probe(() => 'i'.toLocaleUpperCase('tr')),
    timeStyle: probe(() =>
      new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(epoch),
    ),
    timeZoneName: probe(() =>
      new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: 'UTC' }).format(epoch),
    ),
    dateTimeZone: probe(() => new Intl.DateTimeFormat().resolvedOptions().timeZone),
    dateRange: probe(() =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).formatRange(epoch, new Date(864e5)),
    ),
    signDisplay: probe(() => new Intl.NumberFormat('en-US', { signDisplay: 'always' }).format(1)),
    significant: probe(() =>
      new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 }).format(1234),
    ),
    currencyName: probe(() =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
        currencyDisplay: 'name',
      }).format(2),
    ),
    bigint: probe(() => new Intl.NumberFormat('en-US').format(12345678901234567890n)),
    numeric: probe(() => new Intl.Collator('en', { numeric: true }).compare('2', '10')),
    supportedValues: probe(() => typeof Reflect.get(Intl, 'supportedValuesOf')),
    constructors: Object.getOwnPropertyNames(Intl).sort(),
  };
}

async function report() {
  const results = {
    png: await png().catch((error: Error) => `${error.name}: ${error.message}`),
    intl: intl(),
  };
  const body = JSON.stringify(results);

  console.log(`smoke ${body}`);

  await fetch(`${SERVER}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export default function App() {
  void report();

  return <Text>Shell smoke test</Text>;
}
