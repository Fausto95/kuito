import FileSystem, {
  type FileDirectories,
  type FileStat,
} from '../../native/modules/file-system/file-system';

/** What `info` finds at a URI. `lastModified` is milliseconds since 1970, as `File.lastModified`. */
export type FileInfo =
  | { exists: false; uri: string }
  | { exists: true; uri: string; isDirectory: boolean; size: number; lastModified: number };

export type ByteRange = {
  /** The first byte to read. Defaults to 0. */
  position?: number;
  /** How many bytes to read. Defaults to the rest of the file. */
  length?: number;
};

export type WriteOptions = {
  /** Adds to the end of the file instead of replacing it. */
  append?: boolean;
};

/** How far a transfer is. `total` is `null` when the server doesn't say. */
export type TransferProgress = { bytes: number; total: number | null };

/** A running download or upload: await it, or cancel it to reject with `ERR_CANCELED`. */
export type FileTransfer<T> = Promise<T> & { cancel(): Promise<void> };

export type DownloadOptions = {
  headers?: Record<string, string>;
  onProgress?: (progress: TransferProgress) => void;
};

export type DownloadResult = {
  uri: string;
  status: number;
  headers: Record<string, string>;
  mimeType: string | null;
};

export type UploadOptions = {
  /** Defaults to `'POST'`. */
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  /** The file as the whole body, or as one field of a multipart form. Defaults to `'binary'`. */
  uploadType?: 'binary' | 'multipart';
  /** The form field holding the file. Defaults to `'file'`. */
  fieldName?: string;
  mimeType?: string;
  /** More form fields, sent before the file. */
  parameters?: Record<string, string>;
  onProgress?: (progress: TransferProgress) => void;
};

export type UploadResult = { status: number; headers: Record<string, string>; body: string };

let directories: FileDirectories | undefined;

function directory(key: keyof FileDirectories): string {
  return (directories ??= FileSystem.directories())[key];
}

/** Every field the platform reports for an existing entry, as `FileInfo`'s union. */
const fileInfo = (stat: FileStat): FileInfo =>
  stat.exists
    ? {
        exists: true,
        uri: stat.uri,
        isDirectory: stat.isDirectory ?? false,
        size: stat.size ?? 0,
        // The platforms report seconds.
        lastModified: (stat.modificationTime ?? 0) * 1000,
      }
    : { exists: false, uri: stat.uri };

const fileUri = (method: string, uri: string) => {
  if (typeof uri !== 'string' || uri.indexOf('file://') !== 0)
    throw new TypeError(`fileSystem.${method}: '${String(uri)}' is not a file:// URI`);

  return uri;
};

const bytes = (name: string, value: number | undefined) => {
  if (value === undefined) return null;

  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`fileSystem.readBytes: ${name} must be a whole number of bytes`);

  return value;
};

const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

/** Rejects instead of throwing, as every asynchronous function should. */
function attempt<T>(work: () => Promise<T>): Promise<T> {
  try {
    return work();
  } catch (error) {
    return Promise.reject(error);
  }
}

type Kernel = NonNullable<typeof globalThis.__kuito>;
type FileTransferRequest = Parameters<Kernel['fileTransfer']>[0];
type FileTransferResult = Awaited<ReturnType<Kernel['fileTransfer']>['result']>;

function kernel(): Kernel {
  if (!globalThis.__kuito) throw new Error('fileSystem transfers require the Kuito runtime');

  return globalThis.__kuito;
}

type TransferCode = 'ERR_HTTP' | 'ERR_CANCELED' | 'ERR_NETWORK';

function transferError(method: string, code: TransferCode, message: string): Error {
  return Object.assign(new Error(`fileSystem.${method}: ${message}`), { code });
}

const headerRecord = (headers: Headers) => Object.fromEntries(headers.entries());

/**
 * A download or upload on the HTTP host, the same one fetch uses
 * (docs/web-apis.md): the host streams the body to or from the file and
 * reports progress; failures become the fileSystem's codes.
 */
function transfer<T>(
  method: 'download' | 'upload',
  request: Omit<FileTransferRequest, 'onProgress' | 'progress'>,
  onProgress: ((progress: TransferProgress) => void) | undefined,
  finish: (result: FileTransferResult) => T,
): FileTransfer<T> {
  let canceled = false;
  const running = kernel().fileTransfer({
    ...request,
    ...(onProgress && {
      progress: method === 'download' ? ('receive' as const) : ('send' as const),
      onProgress: (bytes: number, total: number | null) => onProgress({ bytes, total }),
    }),
  });
  const promise = running.result.then(finish, (error: Error) => {
    if (canceled) throw transferError(method, 'ERR_CANCELED', `the ${method} was canceled`);

    throw transferError(method, 'ERR_NETWORK', error.message);
  });

  return Object.assign(promise, {
    cancel() {
      canceled = true;
      running.cancel();

      return Promise.resolve();
    },
  });
}

/** A transfer whose setup threw, so it rejects; canceling it does nothing. */
function failed<T>(error: unknown): FileTransfer<T> {
  return Object.assign(Promise.reject(error), { cancel: () => Promise.resolve() });
}

const text = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer;

/** A form field's name or file name, quoted as browsers send it. */
const quoted = (value: string) =>
  value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** The bytes around the file in a multipart/form-data body: its fields, then the file's header. */
function multipart(from: string, options: UploadOptions) {
  const boundary = 'kuito-' + crypto.randomUUID();
  const fields = Object.entries(options.parameters ?? {}).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(name)}"\r\n\r\n${value}\r\n`,
  );
  const fileName = decodeURIComponent(from.slice(from.lastIndexOf('/') + 1));
  const header =
    `--${boundary}\r\nContent-Disposition: form-data; name="${quoted(options.fieldName ?? 'file')}"; ` +
    `filename="${quoted(fileName)}"\r\nContent-Type: ${options.mimeType ?? 'application/octet-stream'}\r\n\r\n`;

  return {
    type: `multipart/form-data; boundary=${boundary}`,
    prefix: text(fields.join('') + header),
    suffix: text(`\r\n--${boundary}--\r\n`),
  };
}

// Files in the app's sandbox (docs/file-system.md). Paths are `file://`
// URIs that `<Image src>` takes. Everything but the directories runs off the
// JS and UI threads.

/** Kept until the app deletes it; backed up on iOS. Ends with `/`. */
export const documents: string = /* @__PURE__ */ directory('document');

/** The system may clear it when space runs low. Ends with `/`. */
export const cache: string = /* @__PURE__ */ directory('cache');

/** The app's own files, read-only: the iOS bundle, `asset:///` on Android. */
export const bundle: string = /* @__PURE__ */ directory('bundle');

/** The file as UTF-8 text; `ERR_ENCODING` when it isn't. */
export function read(uri: string): Promise<string> {
  return attempt(() => FileSystem.readText(fileUri('read', uri)));
}

/**
 * The file's bytes, or `length` of them from `position`. They cross with no
 * encoding: the ArrayBuffer holds the bytes the platform read.
 */
export function readBytes(uri: string, range: ByteRange = {}): Promise<ArrayBuffer> {
  return attempt(() =>
    FileSystem.readBytes({
      uri: fileUri('readBytes', uri),
      position: bytes('position', range.position),
      length: bytes('length', range.length),
    }),
  );
}

/** Text as UTF-8, or an ArrayBuffer's bytes as they are. */
export function write(
  uri: string,
  contents: string | ArrayBuffer,
  options: WriteOptions = {},
): Promise<void> {
  return attempt(() => {
    const request = { uri: fileUri('write', uri), append: options.append ?? false };

    if (typeof contents === 'string') return FileSystem.writeText({ ...request, contents });
    if (isArrayBuffer(contents)) return FileSystem.writeBytes({ ...request, contents });

    throw new TypeError(
      `fileSystem.write: contents must be a string or an ArrayBuffer, not ${Object.prototype.toString.call(contents)}`,
    );
  });
}

export function info(uri: string): Promise<FileInfo> {
  return attempt(() => FileSystem.getInfo(fileUri('info', uri))).then(fileInfo);
}

export function exists(uri: string): Promise<boolean> {
  return attempt(() => FileSystem.getInfo(fileUri('exists', uri))).then((found) => found.exists);
}

/** Fails if the parent is missing, unless `intermediates` creates it. */
export function createDirectory(
  uri: string,
  options: { intermediates?: boolean } = {},
): Promise<void> {
  return attempt(() =>
    FileSystem.makeDirectory(fileUri('createDirectory', uri), options.intermediates ?? false),
  );
}

/** Deletes a file or a directory with its contents. Fails if nothing is there, unless `idempotent`. */
function remove(uri: string, options: { idempotent?: boolean } = {}): Promise<void> {
  return attempt(() => FileSystem.delete(fileUri('delete', uri), options.idempotent ?? false));
}

export { remove as delete };

/** Replaces whatever is at `to`. */
export function move(from: string, to: string): Promise<void> {
  return attempt(() => FileSystem.move(fileUri('move', from), fileUri('move', to)));
}

/** Copies a file or a directory; replaces whatever is at `to`. */
export function copy(from: string, to: string): Promise<void> {
  return attempt(() => FileSystem.copy(fileUri('copy', from), fileUri('copy', to)));
}

/** The names of the directory's entries. */
export function list(uri: string): Promise<string[]> {
  return attempt(() => FileSystem.readDirectory(fileUri('list', uri)));
}

/**
 * Streams `url` into the file at `to`, replacing it once the whole body has
 * arrived. A status outside 200–299 rejects with `ERR_HTTP` and writes nothing.
 */
export function download(
  url: string,
  to: string,
  options: DownloadOptions = {},
): FileTransfer<DownloadResult> {
  let saveTo: string;

  try {
    saveTo = FileSystem.sandboxed(fileUri('download', to), 'write');
  } catch (error) {
    return failed(error);
  }

  return transfer(
    'download',
    { url, method: 'GET', headers: options.headers ?? {}, saveTo },
    options.onProgress,
    ({ status, headers }) => {
      if (status < 200 || status > 299)
        throw transferError(
          'download',
          'ERR_HTTP',
          `${url} answered ${status}; nothing was written`,
        );

      const type = headers.get('content-type');

      return {
        uri: to,
        status,
        headers: headerRecord(headers),
        mimeType: type ? type.split(';')[0].trim() : null,
      };
    },
  );
}

/** Streams the file at `from` to `url`, and resolves with the response whatever its status. */
export function upload(
  url: string,
  from: string,
  options: UploadOptions = {},
): FileTransfer<UploadResult> {
  let file: string;

  try {
    file = FileSystem.sandboxed(fileUri('upload', from), 'read');
  } catch (error) {
    return failed(error);
  }

  const headers = { ...options.headers };
  const form = options.uploadType === 'multipart' ? multipart(from, options) : null;
  const type = form ? form.type : options.mimeType;

  if (type) headers['Content-Type'] = type;

  return transfer(
    'upload',
    {
      url,
      method: options.method ?? 'POST',
      headers,
      body: form ? { file, prefix: form.prefix, suffix: form.suffix } : { file },
    },
    options.onProgress,
    ({ status, headers: answer, body }) => ({
      status,
      headers: headerRecord(answer),
      body: new TextDecoder().decode(body),
    }),
  );
}
