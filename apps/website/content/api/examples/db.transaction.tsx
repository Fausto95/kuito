// Commit several table writes atomically.
import { db, type Schema } from 'kuito';

type Account = { id: string; balance: number };
type Transfer = { from: string; to: string; amount: number };

/** A Standard Schema from a check; an app would bring Valibot or Zod instead. */
function schema<T>(valid: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'app',
      validate: (value) => (valid(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

const accounts = db.table(
  'accounts',
  schema(
    (value): value is Account =>
      isObject(value) &&
      typeof Reflect.get(value, 'id') === 'string' &&
      typeof Reflect.get(value, 'balance') === 'number',
    'expected { id, balance }',
  ),
);
const transfers = db.table(
  'transfers',
  schema(
    (value): value is Transfer =>
      isObject(value) &&
      typeof Reflect.get(value, 'from') === 'string' &&
      typeof Reflect.get(value, 'to') === 'string' &&
      typeof Reflect.get(value, 'amount') === 'number',
    'expected { from, to, amount }',
  ),
);

// Both balances and the record land together, or none of them does.
async function transfer(from: string, to: string, amount: number) {
  const [source] = db.query(accounts, { where: { id: from } }).value;
  const [target] = db.query(accounts, { where: { id: to } }).value;

  if (!source || !target || source.balance < amount) throw new Error('Insufficient funds');

  await db.transaction(() => {
    accounts.update({ id: from }, { balance: source.balance - amount });
    accounts.update({ id: to }, { balance: target.balance + amount });
    transfers.insert({ from, to, amount });
  });
}
