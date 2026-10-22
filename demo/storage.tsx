import {
  Button,
  SafeArea,
  Text,
  VStack,
  db,
  persisted,
  secureStore,
  signal,
  storage,
  type Schema,
} from 'kuito';

// Each launch reads what the last one wrote, then writes its own: kill the
// app and relaunch it to see persisted signals, the database and secureStore
// keep their values.

/** A Standard Schema from a check; an app would bring Valibot or Zod instead. */
function schema<T>(valid: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'demo',
      validate: (value) => (valid(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

const count = schema(
  (value): value is number => typeof value === 'number' && Number.isInteger(value),
  'expected a whole number',
);

const text = schema((value): value is string => typeof value === 'string', 'expected a string');

type Launch = { id: number; at: string };

const launch = schema(
  (value): value is Launch =>
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'id') === 'number' &&
    typeof Reflect.get(value, 'at') === 'string',
  'expected { id, at }',
);

// Read synchronously at startup: the first frame already shows them.
const launches = persisted(0, { key: 'launches', schema: count });
const token = persisted<string | null>(null, { key: 'token', schema: text, secure: true });
const log = db.table('launches', launch);
const recent = db.query(log, { orderBy: { id: 'desc' }, limit: 3 });

const previous = launches.value;

launches.value = previous + 1;
void log.insert({ id: Date.now(), at: `launch ${launches.value}, ${new Date().toISOString()}` });

export default function App() {
  const status = signal('—');

  const attempt = (work: () => Promise<string>) => {
    work().then(
      (done) => (status.value = done),
      (error: Error & { code?: string }) => (status.value = `${error.code}: ${error.message}`),
    );
  };

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <VStack padding={24} gap={16}>
        <Text color="#ffffff" fontSize={22} fontWeight="bold">
          storage
        </Text>
        <Text id="launches" color="#d0d0dc">{`launches before this one: ${previous}`}</Text>
        <Text id="recent" color="#d0d0dc">
          {recent.value.map((row) => row.at).join('\n') || 'no launches logged'}
        </Text>
        <Text id="token" color="#d0d0dc">{`token ${token.value ?? 'none'}`}</Text>
        <Text id="status" color="#f5c518">
          {status.value}
        </Text>
        <Button id="rotate" onPress={() => (token.value = `secret-${launches.value}`)}>
          Rotate the secure token
        </Button>
        <Button
          id="log"
          onPress={() =>
            attempt(async () => {
              await log.insert({ id: Date.now(), at: 'logged by hand' });

              return 'logged';
            })
          }
        >
          Log a row
        </Button>
        <Button
          id="save-guarded"
          onPress={() =>
            attempt(async () => {
              await secureStore.set('guarded', 'biometric secret', {
                requireAuthentication: true,
                authenticationPrompt: 'Save the secret',
              });

              return 'saved';
            })
          }
        >
          Save behind biometrics
        </Button>
        <Button
          id="read-guarded"
          onPress={() =>
            attempt(
              async () =>
                (await secureStore.get('guarded', {
                  requireAuthentication: true,
                  authenticationPrompt: 'Read the secret',
                })) ?? 'none',
            )
          }
        >
          Read behind biometrics
        </Button>
        <Button
          id="corrupt"
          onPress={() =>
            attempt(async () => {
              // The next launch warns in the LogBox and starts from 0.
              await storage.set('launches', '"many"');

              return 'stored a value its schema rejects';
            })
          }
        >
          Store a bad count
        </Button>
        <Button
          id="clear"
          onPress={() =>
            attempt(async () => {
              await storage.clear();
              await log.delete({});
              await secureStore.delete('token');
              await secureStore.delete('guarded');

              return 'cleared';
            })
          }
        >
          Clear everything
        </Button>
      </VStack>
    </SafeArea>
  );
}
