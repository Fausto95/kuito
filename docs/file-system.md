# fileSystem

Files in the app's sandbox: read and write text or
bytes, inspect, create, move, copy and delete, and stream downloads and
uploads to and from disk with progress and cancellation.

```tsx
import { Image, fileSystem } from 'kuito';

const url = 'https://example.com/photo.jpg';
const notes = fileSystem.documents + 'notes.txt';

await fileSystem.write(notes, 'hello');
await fileSystem.write(notes, ' world', { append: true });
await fileSystem.read(notes); // 'hello world'
await fileSystem.readBytes(notes, { position: 6, length: 5 }); // an ArrayBuffer of 'world'
await fileSystem.info(notes); // { exists: true, uri, isDirectory: false, size: 11, lastModified }
await fileSystem.delete(notes);

const photo = fileSystem.download(url, fileSystem.cache + 'photo.jpg', {
  headers: { Authorization: 'Bearer …' },
  onProgress: ({ bytes, total }) => console.log(bytes, total),
});

const { uri } = await photo; // or photo.cancel()

export const Photo = () => <Image src={{ uri }} />;
```

## Directories and URIs

| Directory   | iOS               | Android                       | Notes                                       |
| ----------- | ----------------- | ----------------------------- | ------------------------------------------- |
| `documents` | `Documents/`      | `Context.filesDir`            | kept until the app deletes it               |
| `cache`     | `Library/Caches/` | `Context.cacheDir`            | the system may clear it when space runs low |
| `bundle`    | the `.app` bundle | `asset:///`, the APK's assets | read-only                                   |

Each is a `file://` URI ending in `/`, so a name appends to it. Every path
crosses as a URI, and the URIs `fileSystem` returns are the ones
`<Image src>` takes. The directories are read once, synchronously.

On Android the bundle isn't a directory on disk: `asset:///` URIs work with
`read`, `info`, `list` and as `copy`'s source (copy an
asset out to upload it or show it in an `Image`). A compressed asset's
`info` size is `-1`.

## Functions

| Function                                     | Notes                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read(uri)`                                  | the file as UTF-8 text                                                                                                                                        |
| `readBytes(uri, { position, length })`       | an `ArrayBuffer` of the file's bytes, or `length` of them from `position`                                                                                     |
| `write(uri, contents, { append })`           | `contents` is text, written as UTF-8, or an `ArrayBuffer`; replaces the file atomically, or appends to it                                                     |
| `info(uri)`                                  | `{ exists: false, uri }` or `{ exists: true, uri, isDirectory, size, lastModified }` (milliseconds, as `File.lastModified`); a directory's size is its files' |
| `exists(uri)`                                | `info(uri).exists`                                                                                                                                            |
| `createDirectory(uri, { intermediates })`    | fails if the parent is missing unless `intermediates`, or if something is already there                                                                       |
| `delete(uri, { idempotent })`                | a file, or a directory with its contents; fails if nothing is there unless `idempotent`                                                                       |
| `move(from, to)`, `copy(from, to)`           | replace whatever is at `to`; `copy` takes directories too                                                                                                     |
| `list(uri)`                                  | the entries' names, sorted                                                                                                                                    |
| `download(url, to, { headers, onProgress })` | resolves `{ uri, status, headers, mimeType }`                                                                                                                 |
| `upload(url, from, options)`                 | resolves `{ status, headers, body }` whatever the status                                                                                                      |

Everything but the directories runs on the module's background thread, in
order, so a write followed by a read sees the write. Argument mistakes
(contents that are neither a string nor an ArrayBuffer, a byte range that
isn't whole numbers, a path that isn't a `file://` URI) are `TypeError`s
before anything crosses. The platform
rejects with:

| Code            | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| `ERR_SANDBOX`   | The URI is outside the sandbox, or a write targets the bundle. |
| `ERR_NOT_FOUND` | Nothing at the URI, or a write's parent directory is missing.  |
| `ERR_ENCODING`  | A `read` of a file that isn't UTF-8; use `readBytes`.          |
| `ERR_HTTP`      | A download answered outside 200–299. Nothing is written.       |
| `ERR_CANCELED`  | The transfer was canceled.                                     |
| `ERR_NETWORK`   | The transfer failed on the way: no connection, a timeout, TLS. |

## The sandbox

Reads stay inside the document, cache and bundle directories; writes, moves
and deletes inside the document and cache directories only, and never the
directories themselves. `..` is resolved before the check (on Android,
symlinks too), so a URI can't climb out. Anything else rejects with
`ERR_SANDBOX` before the file system is touched.

## Downloads and uploads

`download` and `upload` return the promise of their result with a
`cancel()` method; canceling rejects the transfer with `ERR_CANCELED`. They
run on the same HTTP host as `fetch` ([web APIs](web-apis.md#fetch)): the
module's sandbox resolves the file first (a synchronous `sandboxed` call,
which rejects with `ERR_SANDBOX` or `ERR_NOT_FOUND`), then the bytes stream
on the platform's network threads (the `URLSession` delegate queue on iOS,
OkHttp's on Android) straight to and from disk: neither a body nor a file
passes through JavaScript or the UI thread. So downloads send no cookies and
use no HTTP cache, as `fetch` doesn't.

- A download lands beside its target and replaces it only once the whole
  body arrived, so a failed or canceled download leaves the old file. Its
  parent directory must exist. Redirects are followed.
- An upload sends the file as the whole body (`uploadType: 'binary'`, the
  default, with `mimeType` as its `Content-Type`) or as one field of a
  `multipart/form-data` form (`uploadType: 'multipart'`, with `fieldName`,
  `mimeType` and `parameters` sent before it). `method` is `POST`, `PUT` or
  `PATCH`. The form's fields and the file's part header are built in
  JavaScript; the host sends them, then the file from disk, then the closing
  boundary. On iOS that body is composed in a temporary file first, so a
  large upload never sits in memory.
- `onProgress` gets `{ bytes, total }`, `total` `null` when the server
  doesn't send a length. Each transfer hears only its own progress, at most
  every 100 ms plus the final count. Without `onProgress` the platform sends
  none.
- A reload or the app closing cancels every transfer.

## Bytes

`readBytes` and `write` take bytes as an `ArrayBuffer`, with no encoding
([native modules](native-modules.md#bytes)). The bytes `readBytes` returns
are the ones the platform read into memory: the ArrayBuffer holds them with
no copy, on iOS and Android alike. An ArrayBuffer JavaScript made is copied
once on its way to the platform, since Hermes keeps it in its
garbage-collected heap; one `readBytes` returned crosses back to `write`
with no copy, so don't change it until the `write` settles, or the file may
hold a mix. Large files still belong off the JS thread, and `readBytes`
reads at most 2 GB at once:

- Move bytes between the network and disk with `download` and `upload`,
  between files with `copy` and `move`, and show images by URI.
- When JavaScript must see the bytes of a large file, read it in ranges:
  `readBytes(uri, { position, length })`, and
  `write(uri, chunk, { append: true })` to write one back.

## Not yet

- Background downloads that continue while the app is suspended, and
  resuming a canceled download.
- `content://` URIs from Android's pickers, and the iOS app group container.
- Hashes (`md5`) in `info`.
