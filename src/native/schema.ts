// What stored data is checked against: any Standard Schema v1
// (https://standardschema.dev), the interface Valibot, Zod and ArkType all
// implement, so an app brings its own validation library and Kuito depends
// on none (docs/storage.md#schemas).

/** A problem a schema found, and where in the value. */
export type SchemaIssue = {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
};

export type SchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: readonly SchemaIssue[] };

/** A Standard Schema whose output is `T`. */
export interface Schema<T> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => SchemaResult<T> | Promise<SchemaResult<T>>;
    readonly types?: { readonly input: unknown; readonly output: T } | undefined;
  };
}

const segment = (key: PropertyKey | { readonly key: PropertyKey }) =>
  String(typeof key === 'object' ? key.key : key);

function describe({ message, path }: SchemaIssue): string {
  return path?.length ? message + ' at ' + path.map(segment).join('.') : message;
}

/**
 * `value` as `schema` outputs it, or the first issue it found. A schema that
 * validates asynchronously throws: stored data is read synchronously.
 */
export function check<T>(
  schema: Schema<T>,
  value: unknown,
  subject: string,
): { ok: true; value: T } | { ok: false; issue: string } {
  const result = schema['~standard'].validate(value);

  if ('then' in result)
    throw new TypeError(
      subject +
        ': its schema validates asynchronously; stored data is read synchronously, so use a synchronous schema.',
    );

  if (result.issues) return { ok: false, issue: result.issues.map(describe).join('; ') };

  return { ok: true, value: result.value };
}
