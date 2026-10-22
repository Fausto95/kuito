import { Text, persisted, platform, storage, type Schema } from 'kuito';

// test/shell-smoke.test.ts launches this twice, killing the shell in between:
// each launch reports the count the last one persisted, once the store reads
// back its own.

// The test's server; the Android emulator reaches the host's loopback at 10.0.2.2.
const SERVER = `http://${platform === 'android' ? '10.0.2.2' : '127.0.0.1'}:18990`;

const count: Schema<number> = {
  '~standard': {
    version: 1,
    vendor: 'smoke',
    validate: (value) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'expected a number' }] },
  },
};

const launches = persisted(0, { key: 'smoke-launches', schema: count });
const before = launches.value;

launches.value = before + 1;

/** The store's value once it is this launch's: the write leaves at the end of the task. */
async function stored(): Promise<string | null> {
  const deadline = Date.now() + 5000;
  let value = await storage.get('smoke-launches');

  while (value !== String(launches.value) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 20));
    value = await storage.get('smoke-launches');
  }

  return value;
}

async function report() {
  const body = JSON.stringify({ before, stored: await stored() });

  console.log(`smoke ${body}`);

  await fetch(`${SERVER}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export default function App() {
  void report();

  return <Text>{`launches before this one: ${before}`}</Text>;
}
