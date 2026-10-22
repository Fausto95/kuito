import { defineModule, fn } from '../../../src/native/define-module';

export type FileAccess = 'read' | 'write';

/** The sandbox's roots, as `file://` (or `asset:///`) URIs ending with `/`. */
export type FileDirectories = { document: string; cache: string; bundle: string };

/** What is at a URI; the rest is there only when it exists. Times are seconds since 1970. */
export type FileStat = {
  exists: boolean;
  uri: string;
  isDirectory?: boolean;
  size?: number;
  modificationTime?: number;
};

/** A file's bytes from `position`, `length` of them; null: from the start, to the end. */
export type FileByteRange = { uri: string; position: number | null; length: number | null };

export type FileTextWrite = { uri: string; contents: string; append: boolean };

export type FileBytesWrite = { uri: string; contents: ArrayBuffer; append: boolean };

// Files in the app's sandbox (docs/file-system.md). File work runs on the
// module's background thread; downloads and uploads stream on the HTTP host
// (native/shared/Http.h), to and from the files `sandboxed` resolves.
export default defineModule('FileSystem', {
  directories: fn.sync<() => FileDirectories>(),
  /**
   * The canonical URI of a file the sandbox lets the app read (it exists) or
   * write (its directory exists), where the HTTP host streams a transfer.
   */
  sandboxed: fn.sync<(uri: string, access: FileAccess) => string>(),
  getInfo: fn.background<(uri: string) => Promise<FileStat>>(),
  readText: fn.background<(uri: string) => Promise<string>>(),
  readBytes: fn.background<(request: FileByteRange) => Promise<ArrayBuffer>>(),
  writeText: fn.background<(request: FileTextWrite) => Promise<void>>(),
  writeBytes: fn.background<(request: FileBytesWrite) => Promise<void>>(),
  makeDirectory: fn.background<(uri: string, intermediates: boolean) => Promise<void>>(),
  delete: fn.background<(uri: string, idempotent: boolean) => Promise<void>>(),
  move: fn.background<(from: string, to: string) => Promise<void>>(),
  copy: fn.background<(from: string, to: string) => Promise<void>>(),
  readDirectory: fn.background<(uri: string) => Promise<string[]>>(),
  ios: { class: 'KuitoFileSystemModule' },
  android: { class: 'dev.kuito.runtime.modules.filesystem.KuitoFileSystemModule' },
});
