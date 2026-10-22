import Storage, { type SqlRows } from '../../native/modules/storage/storage';
import type { ReadonlySignal } from '../ui/reactivity';
import { check, type Schema } from './schema';
import { report, source, warn } from './scope';
import type { SqlStatement, SqlValue } from './storage';

type Column<T> = keyof T & string;

/** Comparisons of one column's value: a row matches when every one holds. */
export interface Comparison<V> {
  gt?: Extract<V, string | number>;
  gte?: Extract<V, string | number>;
  lt?: Extract<V, string | number>;
  lte?: Extract<V, string | number>;
  /** Rows whose column isn't this value: NULL isn't `'a'`, and `{ not: null }` is every non-NULL. */
  not?: V;
  /** Rows whose column is one of these; `null` among them matches NULL. */
  in?: readonly V[];
  /** SQL's LIKE: `%` is any run of characters, `_` one; ASCII letters match either case. */
  like?: [Extract<V, string>] extends [never] ? never : string;
}

/** Rows whose columns equal these values, or pass these comparisons; `null` matches NULL. */
export type Where<T> = { readonly [K in Column<T>]?: T[K] | Comparison<T[K]> };

export interface QueryOptions<T> {
  where?: Where<T>;
  /** Columns to sort by, the first first. */
  orderBy?: { readonly [K in Column<T>]?: 'asc' | 'desc' };
  limit?: number;
}

/** A table the migrations made, and the schema each of its rows matches. */
export interface Table<T> {
  readonly name: string;
  readonly schema: Schema<T>;
  /** Inserts every row in one transaction: all of them land, or none. */
  insert(rows: T | readonly T[]): Promise<void>;
  update(where: Where<T>, changes: Partial<T>): Promise<void>;
  /** Deletes the rows `where` matches: `{}` matches every row. */
  delete(where: Where<T>): Promise<void>;
}

// Typed tables over the app's SQLite database, and queries whose rows follow
// its writes (docs/storage.md#database). Each table's writes are counted, so
// a query knows when the rows it read went stale.
const writes = new Map<string, number>();
const followers = new Map<string, Set<() => void>>();

const writesTo = (table: string) => writes.get(table) ?? 0;

function wrote(table: string): void {
  writes.set(table, writesTo(table) + 1);
  followers.get(table)?.forEach((refresh) => refresh());
}

function follow(table: string, refresh: () => void): () => void {
  const following = followers.get(table) ?? new Set();

  followers.set(table, following.add(refresh));

  return () => following.delete(refresh);
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `name` quoted for SQL, once it is a plain identifier: nothing an app passes runs as SQL. */
function identifier(subject: string, name: string, what: 'table' | 'column'): string {
  if (!NAME.test(name))
    throw new TypeError(
      subject + ': "' + name + '" is not a ' + what + ' name; use letters, digits and _.',
    );

  return '"' + name + '"';
}

// Each table's columns as the migrations made them, read once: migrations
// only change with a rebuild of the shell.
const tableColumns = new Map<string, readonly string[]>();

function columnsOf(table: string): readonly string[] {
  const known = tableColumns.get(table);

  if (known) return known;

  const { columns } = Storage.select(
    'SELECT * FROM ' + identifier('db', table, 'table') + ' LIMIT 0',
    [],
  );

  tableColumns.set(table, columns);

  return columns;
}

/** `name` quoted for SQL, once `table` has that column. */
function column(subject: string, table: string, name: string): string {
  const quoted = identifier(subject, name, 'column');
  const columns = columnsOf(table);

  if (!columns.includes(name))
    throw new TypeError(
      subject +
        ': ' +
        table +
        ' has no column "' +
        name +
        '"; its columns are ' +
        columns.join(', ') +
        '.',
    );

  return quoted;
}

function bindable(subject: string, column: string, value: unknown): SqlValue {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' || value === null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  throw new TypeError(
    subject + ': "' + column + '" must be a string, number, boolean or null, not ' + typeof value,
  );
}

/** Entries an app set: an `undefined` column is left out, as JSON leaves it out. */
const defined = (values: object) =>
  Object.entries(values).filter(([, value]) => value !== undefined);

/** A comparison's SQL for the quoted column; `bind` checks a value, `fail` says what it needs. */
type Compare = (
  quoted: string,
  value: unknown,
  bind: (value: unknown) => SqlValue,
  fail: (needs: string) => never,
) => SqlStatement;

const ordered =
  (sign: string): Compare =>
  (quoted, value, bind, fail) =>
    typeof value === 'string' || typeof value === 'number'
      ? { sql: quoted + ' ' + sign + ' ?', params: [bind(value)] }
      : fail('a string or number');

const COMPARISONS: { readonly [operator: string]: Compare } = {
  gt: ordered('>'),
  gte: ordered('>='),
  lt: ordered('<'),
  lte: ordered('<='),
  // IS NOT, unlike !=, counts NULL as a value: NULL is not 'a'.
  not: (quoted, value, bind) => ({ sql: quoted + ' IS NOT ?', params: [bind(value)] }),
  in: (quoted, value, bind, fail) => {
    if (!Array.isArray(value)) return fail('a list');

    const params = value.filter((each) => each !== null).map(bind);
    const terms = [
      ...(params.length ? [quoted + ' IN (' + params.map(() => '?').join(', ') + ')'] : []),
      ...(params.length < value.length ? [quoted + ' IS NULL'] : []),
    ];

    // An empty list matches no row.
    return { sql: terms.length ? '(' + terms.join(' OR ') + ')' : '0', params };
  },
  like: (quoted, value, bind, fail) =>
    typeof value === 'string'
      ? { sql: quoted + ' LIKE ?', params: [bind(value)] }
      : fail('a string pattern'),
};

/** The comparisons, as an error lists them: `gt, gte, …, in or like`. */
const OPERATORS = Object.keys(COMPARISONS)
  .join(', ')
  .replace(/, (\w+)$/, ' or $1');

const describe = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value;

/** `name`'s terms: equal to `value`, or passing each of its comparisons. */
function terms(subject: string, quoted: string, name: string, value: unknown): SqlStatement[] {
  const bind = (each: unknown) => bindable(subject, name, each);

  if (value === null) return [{ sql: quoted + ' IS NULL', params: [] }];
  if (typeof value !== 'object') return [{ sql: quoted + ' = ?', params: [bind(value)] }];

  const comparisons = defined(value);

  if (!comparisons.length)
    throw new TypeError(subject + ': "' + name + '" compares nothing; give it ' + OPERATORS + '.');

  return comparisons.map(([operator, operand]) => {
    // Own keys only: `toString` is no comparison.
    const compare = Object.hasOwn(COMPARISONS, operator) ? COMPARISONS[operator] : undefined;

    if (!compare)
      throw new TypeError(
        subject + ': "' + name + '" compares with ' + OPERATORS + ', not "' + operator + '"',
      );

    return compare(quoted, operand, bind, (needs) => {
      throw new TypeError(
        subject + ': "' + name + '" ' + operator + ' needs ' + needs + ', not ' + describe(operand),
      );
    });
  });
}

function whereClause(subject: string, table: string, where: object): SqlStatement {
  const all = defined(where).flatMap(([name, value]) =>
    terms(subject, column(subject, table, name), name, value),
  );

  return {
    sql: all.length ? ' WHERE ' + all.map((each) => each.sql).join(' AND ') : '',
    params: all.flatMap((each) => each.params),
  };
}

const DIRECTIONS: Record<string, string> = { asc: 'ASC', desc: 'DESC' };

function selection(table: string, options: QueryOptions<unknown>): SqlStatement {
  const subject = 'db.query';
  const { where = {}, orderBy = {}, limit } = options;
  const filter = whereClause(subject, table, where);
  const order = defined(orderBy).map(([name, direction]) => {
    const sort = typeof direction === 'string' ? DIRECTIONS[direction] : undefined;

    if (!sort) throw new TypeError(subject + ': orderBy "' + name + '" must be asc or desc.');

    return column(subject, table, name) + ' ' + sort;
  });

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0))
    throw new TypeError(subject + ': limit must be a whole number, not ' + String(limit));

  return {
    sql:
      'SELECT * FROM ' +
      identifier(subject, table, 'table') +
      filter.sql +
      (order.length ? ' ORDER BY ' + order.join(', ') : '') +
      (limit === undefined ? '' : ' LIMIT ?'),
    params: limit === undefined ? filter.params : [...filter.params, limit],
  };
}

/** Each row as its schema outputs it; rows it rejects are a warning, and left out. */
function decode<T>(schema: Schema<T>, { columns, rows }: SqlRows, subject: string): T[] {
  const matching: T[] = [];
  const issues: string[] = [];

  rows.forEach((values) => {
    const result = check(
      schema,
      Object.fromEntries(columns.map((column, index) => [column, values[index]])),
      subject,
    );

    if (result.ok) matching.push(result.value);
    else issues.push(result.issue);
  });

  if (issues.length)
    warn(
      subject +
        ': ' +
        (issues.length === 1 ? "1 row doesn't" : issues.length + " rows don't") +
        " match the table's schema (" +
        issues[0] +
        '); ' +
        (issues.length === 1 ? 'it is' : 'they are') +
        ' left out.',
    );

  return matching;
}

const isList = <T>(rows: T | readonly T[]): rows is readonly T[] => Array.isArray(rows);

/** Rejects instead of throwing, as a function returning a promise should. */
function attempt(run: () => Promise<void>): Promise<void> {
  try {
    return run();
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Runs `statements` in one native transaction; queries of `tables` follow once it lands. */
const commit = (tables: Iterable<string>, statements: SqlStatement[]) =>
  Storage.write(statements).then(() => {
    for (const table of tables) wrote(table);
  });

/** The writes `db.transaction` collects while its function runs, and the promise they settle. */
type Collecting = {
  statements: SqlStatement[];
  tables: Set<string>;
  failure: { error: unknown } | null;
  done: Promise<void>;
};

let collecting: Collecting | null = null;

/**
 * A table's write: one transaction of its own, or part of the one
 * `db.transaction` is collecting, whose promise it returns.
 */
function write(table: string, build: () => SqlStatement[]): Promise<void> {
  if (!collecting) return attempt(() => commit([table], build()));

  try {
    collecting.statements.push(...build());
    collecting.tables.add(table);
  } catch (error) {
    collecting.failure ??= { error };
  }

  return collecting.done;
}

/** The table `name`, whose rows match `schema`. Migrations in kuito.config.ts make it. */
export function table<T>(name: string, schema: Schema<T>): Table<T> {
  const quoted = identifier('db.table', name, 'table');

  const columns = (subject: string, values: object) =>
    defined(values).map(([each, value]) => ({
      name: column(subject, name, each),
      value: bindable(subject, each, value),
    }));

  const insertion = (row: T, index: number): SqlStatement => {
    const subject = name + '.insert';
    const result = check(schema, row, subject);

    if (!result.ok)
      throw new TypeError(
        subject + ': row ' + (index + 1) + " doesn't match the table's schema: " + result.issue,
      );

    const values = columns(subject, result.value as object);

    return {
      sql: values.length
        ? 'INSERT INTO ' +
          quoted +
          ' (' +
          values.map((each) => each.name).join(', ') +
          ') VALUES (' +
          values.map(() => '?').join(', ') +
          ')'
        : 'INSERT INTO ' + quoted + ' DEFAULT VALUES',
      params: values.map((each) => each.value),
    };
  };

  return {
    name,
    schema,
    insert: (rows) => write(name, () => (isList(rows) ? rows : [rows]).map(insertion)),
    update: (where, changes) =>
      write(name, () => {
        const subject = name + '.update';
        const values = columns(subject, changes);
        const filter = whereClause(subject, name, where);

        if (!values.length) throw new TypeError(subject + ': the changes set no column.');

        return [
          {
            sql:
              'UPDATE ' +
              quoted +
              ' SET ' +
              values.map((each) => each.name + ' = ?').join(', ') +
              filter.sql,
            params: [...values.map((each) => each.value), ...filter.params],
          },
        ];
      }),
    delete: (where) =>
      write(name, () => {
        const filter = whereClause(name + '.delete', name, where);

        return [{ sql: 'DELETE FROM ' + quoted + filter.sql, params: filter.params }];
      }),
  };
}

const isPromise = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

/**
 * Runs `writes` into `collected`. What it throws fails the transaction, as a
 * promise it returns does: writes after an `await` would miss the transaction.
 */
function collect(collected: Collecting, writes: () => undefined): void {
  try {
    if (isPromise(writes()))
      throw new TypeError(
        'db.transaction: its function returned a promise, so writes after an await would miss ' +
          'the transaction. Make it synchronous: read what it needs first, then call db.transaction.',
      );
  } catch (error) {
    collected.failure ??= { error };
  }
}

/**
 * Runs `writes`, and lands every table write it makes in one transaction:
 * all of them, or none. Each write returns the transaction's promise. A
 * transaction inside another joins it, and its failure fails the outer one.
 */
export function transaction(writes: () => undefined): Promise<void> {
  if (collecting) {
    collect(collecting, writes);

    return collecting.done;
  }

  // Writes return `done` before the transaction has anything to settle it with.
  let land = (_landed: Promise<void>) => {};
  const done = new Promise<void>((resolve, reject) => {
    land = (landed) => void landed.then(resolve, reject);
  });
  const collected: Collecting = { statements: [], tables: new Set(), failure: null, done };

  collecting = collected;
  collect(collected, writes);
  collecting = null;

  const { statements, tables, failure } = collected;

  land(
    failure
      ? Promise.reject(failure.error)
      : statements.length
        ? commit(tables, statements)
        : Promise.resolve(),
  );

  return done;
}

/**
 * What `statement` reads from `table`, as a signal: read synchronously at
 * first, then again on the background thread after each write to the table.
 */
function following<R>(
  table: string,
  { sql, params }: SqlStatement,
  subject: string,
  decode: (rows: SqlRows) => R,
): ReadonlySignal<R> {
  // The result, and how many writes to the table it saw.
  let read: { writes: number; result: R } | null = null;

  return source(
    () => {
      const seen = writesTo(table);

      if (read?.writes !== seen)
        read = { writes: seen, result: decode(Storage.select(sql, params)) };

      return read.result;
    },
    (set) => {
      let running = false;
      let again = false;

      // One read at a time; writes that land during it read once more after.
      const refresh = () => {
        if (running) {
          again = true;

          return;
        }

        const seen = writesTo(table);

        running = true;

        Storage.selectAsync(sql, params)
          .then(
            (rows) => {
              read = { writes: seen, result: decode(rows) };
              set(read.result);
            },
            report(subject + ' could not read'),
          )
          .finally(() => {
            running = false;

            if (!again) return;

            again = false;
            refresh();
          });
      };

      return follow(table, refresh);
    },
  );
}

/**
 * The rows of `table` that `options` select, as a signal: read synchronously
 * at first, then again on the background thread after each write to the table.
 */
export function query<T>(table: Table<T>, options: QueryOptions<T> = {}): ReadonlySignal<T[]> {
  const subject = 'db.query("' + table.name + '")';

  return following(table.name, selection(table.name, options), subject, (rows) =>
    decode(table.schema, rows, subject),
  );
}

/** How many rows of `table` `where` matches, as a signal that follows writes as a query does. */
export function count<T>(table: Table<T>, where: Where<T> = {}): ReadonlySignal<number> {
  const filter = whereClause('db.count', table.name, where);
  const subject = 'db.count("' + table.name + '")';

  return following(
    table.name,
    {
      sql: 'SELECT COUNT(*) FROM ' + identifier('db.count', table.name, 'table') + filter.sql,
      params: filter.params,
    },
    subject,
    ({ rows }) => {
      const [[counted] = []] = rows;

      if (typeof counted !== 'number') throw new TypeError(subject + ': SQLite counted no number.');

      return counted;
    },
  );
}
