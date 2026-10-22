// The Live Patch link between the dev server (src/dev/device-server.ts) and a
// shell's dev connection, written once (docs/devtools.md#the-dev-link).
// Every message is a JSON object keyed by `type`. scripts/generate-protocol.ts
// turns the types into KuitoDevLink.generated in Swift and Kotlin, whose
// handle() switches cover them; plain data, no imports.

/** A field's JSON type; `string?` may be absent. `json` is passed through as is. */
export type FieldType = 'string' | 'string?' | 'integer' | 'number' | 'json';

interface MessageSpec {
  doc: string;
  fields: Readonly<Record<string, FieldType>>;
}

export const DEV_LINK = {
  /** What the dev server sends a shell. */
  server: {
    patch: {
      doc: 'A compiled revision of the app, as JavaScript source: evaluate it and ack.',
      fields: { revision: 'integer', source: 'string' },
    },
    command: {
      doc: 'A one-shot instruction, like opening the devtools.',
      fields: { name: 'string' },
    },
    symbolicated: {
      doc: "A logged entry's frames mapped to source: the answer to a log with an id.",
      fields: { id: 'string', frames: 'json', codeFrame: 'json' },
    },
  },
  /** What a shell sends the dev server. */
  device: {
    hello: {
      doc: 'Who the device is, sent once the link is up.',
      fields: { id: 'string', name: 'string', platform: 'string' },
    },
    log: {
      doc: 'A console entry to print where it was logged; with an id, the server answers with its frames.',
      fields: { level: 'string', message: 'string', stack: 'string', id: 'string?' },
    },
    open: {
      doc: "A source position to open in the developer's editor.",
      fields: { file: 'string', line: 'integer', column: 'integer' },
    },
    applied: {
      doc: 'The device evaluated a patch; ms is how long evaluating it took.',
      fields: { revision: 'integer', ms: 'number' },
    },
    rejected: {
      doc: 'Evaluating a patch failed; the previous version stays live.',
      fields: { revision: 'integer', code: 'string', message: 'string' },
    },
    recording: {
      doc: "The answer to the record command: the runtime's batches so far (.krec, base64) and the native view tree they built.",
      fields: { recording: 'string', tree: 'string' },
    },
  },
  /** The codes a `rejected` message carries. */
  rejections: {
    evaluation: { code: 'EVALUATION', meaning: 'Evaluating the patch threw.' },
  },
} as const satisfies {
  server: Record<string, MessageSpec>;
  device: Record<string, MessageSpec>;
  rejections: Record<string, { code: string; meaning: string }>;
};

export type DevLinkProtocol = typeof DEV_LINK;

type ValueOf<T extends FieldType> = T extends 'string' | 'string?'
  ? string
  : T extends 'integer' | 'number'
    ? number
    : unknown;

type Fields<F extends Readonly<Record<string, FieldType>>> = {
  -readonly [K in keyof F as F[K] extends 'string?' ? never : K]: ValueOf<F[K]>;
} & { -readonly [K in keyof F as F[K] extends 'string?' ? K : never]?: ValueOf<F[K]> };

type Messages<M extends Record<string, MessageSpec>> = {
  [T in keyof M]: { type: T } & Fields<M[T]['fields']>;
}[keyof M];

export type ServerMessage = Messages<DevLinkProtocol['server']>;

export type DeviceMessage = Messages<DevLinkProtocol['device']>;
