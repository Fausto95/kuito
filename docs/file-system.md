# Read, write and transfer files

Use fileSystem for documents, cached downloads and media files in the app sandbox. Use storage or db for structured app state.

## Write a note and download a photo

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

## Behavior and limits

`documents` persists until the app or user removes its data; `cache` can be evicted; `bundle` is read-only. Directory URIs end in `/`. Android bundled files use `asset:///` rather than an on-disk path. Create parent directories before writing. Transfers return cancellable promises and stream between disk and the network. A download rejects outside HTTP 200–299 and replaces its target only after success; an upload returns the response status for you to check. Handle missing files, sandbox violations, network errors and cancellation. Downloads do not continue as background OS transfers.

## Continue

Read [Storage](storage.md) for the related workflow. The API reference lists every method, option, event and return type.
