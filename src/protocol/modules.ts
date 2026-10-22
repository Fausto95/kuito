// The native module contract the link table shares with each platform
// (docs/native-modules.md): where a function runs and the host's error codes.
// scripts/generate-protocol.ts turns it into KuitoModuleProtocol.generated
// in Swift and Kotlin; plain data, no imports.

/**
 * Where a function runs: a `js` function returns synchronously, the others
 * return a Promise.
 */
export const THREADS = {
  js: 'The JS thread: the call returns its result.',
  main: 'The main (UI) thread.',
  background: "The module's own serial background thread: its calls run in order.",
} as const;

export interface ErrorSpec {
  code: string;
  meaning: string;
  /** Raised on these platforms only; both by default. */
  platforms?: readonly ('ios' | 'android')[];
}

/** The host's own error codes, by their name in Swift and Kotlin (`KuitoErrorCode`). */
export const ERRORS = {
  functionNotFound: {
    code: 'ERR_FUNCTION_NOT_FOUND',
    meaning: "The shell's link table doesn't hold the function: rebuild it.",
  },
  viewNotFound: {
    code: 'ERR_VIEW_NOT_FOUND',
    meaning: "A view function's view is not mounted.",
  },
  argument: { code: 'ERR_ARGUMENT', meaning: "An argument didn't decode into the declared type." },
  encode: {
    code: 'ERR_ENCODE',
    meaning: "A result or event payload isn't plain data of the declared type.",
  },
  native: {
    code: 'ERR_NATIVE',
    meaning: 'The function threw something other than `KuitoModuleError`.',
  },
  thread: {
    code: 'ERR_THREAD',
    meaning: 'A synchronous call reached an asynchronous function.',
  },
  noActivity: {
    code: 'ERR_NO_ACTIVITY',
    meaning: 'The module needs the activity, and a background task runs without one.',
    platforms: ['android'],
  },
} as const satisfies Record<string, ErrorSpec>;

export interface ModuleProtocol {
  threads: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, ErrorSpec>>;
}

export const MODULES: ModuleProtocol = { threads: THREADS, errors: ERRORS };
