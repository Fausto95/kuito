import {
  Button,
  Image,
  SafeArea,
  Scroll,
  VStack,
  Text,
  onMount,
  signal,
  Show,
  fileSystem,
  fonts,
} from 'kuito';

// fileSystem and fonts end to end (docs/file-system.md, docs/fonts.md):
// write, read and delete a file, download an image with progress and show it
// from its file URI, then load a font at run time in two weights. Run it
// from an app whose kuito.config.ts bundles Pacifico to see a bundled font.

const PHOTO = 'https://picsum.photos/id/1018/3000/2000.jpg';
const UPLOAD = 'https://httpbin.org/anything';
const LATO = 'https://raw.githubusercontent.com/google/fonts/main/ofl/lato/';

const failed = (error: Error & { code?: string }) =>
  `${error.code ?? error.name}: ${error.message}`;

export default function App() {
  const files = signal('writing…');
  const guard = signal('…');
  const progress = signal('waiting');
  const photo = signal('');
  const canceled = signal('…');
  const uploaded = signal('uploading after the download…');
  const lato = signal(false);
  const missing = signal(false);

  onMount(() => {
    const notes = fileSystem.documents + 'notes.txt';

    void (async () => {
      await fileSystem.write(notes, 'hello');
      await fileSystem.write(notes, ' world', { append: true });
      await fileSystem.write(notes, new Uint8Array([0x21]).buffer, { append: true });

      const text = await fileSystem.read(notes);
      const head = [...new Uint8Array(await fileSystem.readBytes(notes, { length: 5 }))].join(' ');
      const info = await fileSystem.info(notes);

      await fileSystem.delete(notes);
      files.value = `read "${text}", first 5 bytes ${head}, ${info.exists ? info.size : 0} bytes; deleted: ${!(await fileSystem.exists(notes))}`;
    })().catch((error: Error) => (files.value = failed(error)));

    fileSystem.write('file:///etc/hosts', 'x').then(
      () => (guard.value = 'wrote outside the sandbox'),
      (error: Error) => (guard.value = failed(error)),
    );

    const photoFile = fileSystem.cache + 'photo.jpg';

    fileSystem
      .download(PHOTO, photoFile, {
        onProgress: ({ bytes, total }) =>
          (progress.value = total
            ? `${Math.round((bytes / total) * 100)}% of ${total} bytes`
            : `${bytes} bytes`),
      })
      .then(
        ({ uri, mimeType }) => {
          progress.value += ` · ${mimeType ?? 'unknown type'}`;
          photo.value = uri;
          upload(uri).catch((error: Error) => (uploaded.value = failed(error)));
        },
        (error: Error) => (progress.value = failed(error)),
      );

    // The photo back up, whole and as a form; httpbin echoes what it got.
    async function upload(uri: string) {
      let sent = '';
      const whole = await fileSystem.upload(UPLOAD, uri, {
        mimeType: 'image/jpeg',
        onProgress: ({ bytes, total }) => (sent = `${bytes} of ${total ?? '?'} bytes sent`),
      });
      const form = await fileSystem.upload(UPLOAD, uri, {
        uploadType: 'multipart',
        fieldName: 'photo',
        mimeType: 'image/jpeg',
        parameters: { album: 'trips' },
      });
      const echoed = JSON.parse(whole.body) as { headers: Record<string, string> };
      const fields = JSON.parse(form.body) as {
        form: Record<string, string>;
        files: Record<string, string>;
      };

      uploaded.value =
        `binary ${whole.status}: server got ${echoed.headers['Content-Length']} bytes (${sent}); ` +
        `multipart ${form.status}: album=${fields.form.album}, photo ${fields.files.photo ? 'received' : 'missing'}`;
    }

    const doomed = fileSystem.download(PHOTO + '?again', fileSystem.cache + 'doomed.jpg');

    doomed.then(
      () => (canceled.value = 'finished before it was canceled'),
      (error: Error) => (canceled.value = failed(error)),
    );

    void doomed.cancel();

    void (async () => {
      const regular = fileSystem.cache + 'Lato-Regular.ttf';
      const bold = fileSystem.cache + 'Lato-Bold.ttf';

      await Promise.all([
        fileSystem.download(LATO + 'Lato-Regular.ttf', regular),
        fileSystem.download(LATO + 'Lato-Bold.ttf', bold),
      ]);

      await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });
      lato.value = true;
    })().catch((error: Error) => (files.value = failed(error)));
  });

  return (
    <SafeArea flex={1} backgroundColor="#101018">
      <Scroll>
        <VStack padding={24} gap={14}>
          <Text color="#ffffff" fontSize={22} fontWeight="bold">
            fileSystem
          </Text>
          <Text id="files" color="#d0d0dc">
            {files.value}
          </Text>
          <Text id="guard" color="#f5c518">
            {guard.value}
          </Text>
          <Text id="progress" color="#d0d0dc">
            {progress.value}
          </Text>
          <Text id="canceled" color="#d0d0dc">
            {canceled.value}
          </Text>
          <Text id="uploaded" color="#d0d0dc">
            {uploaded.value}
          </Text>
          <Show when={() => photo.value !== ''}>
            <Image id="photo" src={{ uri: photo.value }} aspectRatio={1.5} placeholder="#1c1c25" />
          </Show>
          <Text color="#ffffff" fontSize={22} fontWeight="bold">
            fonts
          </Text>
          <Show
            when={() => fonts.loaded('Pacifico')}
            fallback={<Text color="#d0d0dc">Pacifico is not bundled</Text>}
          >
            <Text id="bundled" color="#ffffff" fontSize={28} fontFamily="Pacifico">
              Bundled Pacifico
            </Text>
          </Show>
          <Show when={() => lato.value} fallback={<Text color="#d0d0dc">loading Lato…</Text>}>
            <Text id="lato-regular" color="#ffffff" fontSize={24} fontFamily="Lato">
              Lato 400, loaded at run time
            </Text>
            <Text id="lato-bold" color="#ffffff" fontSize={24} fontFamily="Lato" fontWeight="bold">
              Lato 700, loaded at run time
            </Text>
          </Show>
          <Button id="missing" onPress={() => (missing.value = true)}>
            Render a missing family
          </Button>
          <Show when={() => missing.value}>
            <Text id="missing-family" color="#ffffff" fontFamily="No Such Font">
              Never drawn
            </Text>
          </Show>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
