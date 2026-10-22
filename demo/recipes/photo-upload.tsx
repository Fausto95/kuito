import {
  Box,
  Button,
  Camera,
  HStack,
  Image,
  SafeArea,
  Show,
  Text,
  VStack,
  cameraRef,
  fileSystem,
  mediaPicker,
  signal,
} from 'kuito';

/**
 * A photo from the camera or the library, uploaded with a progress bar.
 * Before it leaves the phone, its JPEG metadata (EXIF and XMP: the camera,
 * the time, sometimes the place) is taken out and the rest written to a file.
 */
type Photo = { uri: string; mimeType: string };

// Replace with your server. httpbin.org answers any POST with what it got.
export const UPLOAD_URL = 'https://httpbin.org/post';

/** The JPEG without its APP1 segments, where EXIF and XMP live; any other file as it is. */
export function withoutMetadata(bytes: ArrayBuffer): ArrayBuffer {
  const jpeg = new Uint8Array(bytes);

  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return bytes;

  const kept = [jpeg.subarray(0, 2)];
  let at = 2;

  // Each segment says its length, up to the scan (0xDA), whose data runs to the end.
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff && jpeg[at + 1] !== 0xda) {
    const end = at + 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);

    if (jpeg[at + 1] !== 0xe1) kept.push(jpeg.subarray(at, end));
    at = end;
  }

  kept.push(jpeg.subarray(at));

  const clean = new Uint8Array(kept.reduce((length, part) => length + part.length, 0));
  let offset = 0;

  kept.forEach((part) => {
    clean.set(part, offset);
    offset += part.length;
  });

  return clean.buffer;
}

/** Writes the cleaned JPEG beside the original, in the app's cache. */
async function cleaned(uri: string, bytes: ArrayBuffer): Promise<Photo> {
  const clean = uri.replace(/\.\w+$/, '-clean.jpg');

  await fileSystem.write(clean, withoutMetadata(bytes));

  return { uri: clean, mimeType: 'image/jpeg' };
}

export default function PhotoUpload() {
  const camera = cameraRef();
  const photo = signal<Photo | null>(null);
  const progress = signal<number | null>(null);
  const status = signal('');

  const attempt = (work: () => Promise<string>) =>
    void work().then(
      (done) => (status.value = done),
      (error: Error & { code?: string }) =>
        (status.value = `${error.code ?? error.name}: ${error.message}`),
    );

  const take = () =>
    attempt(async () => {
      // `bytes` hands the JPEG over with the picture: no second read of its file.
      const picture = await camera.current?.takePicture({ quality: 0.8, bytes: true });

      if (!picture?.bytes) return 'The camera is not ready';

      photo.value = await cleaned(picture.uri, picture.bytes);

      return 'Photo taken';
    });

  const choose = () =>
    attempt(async () => {
      const picked = await mediaPicker.pick({ maxWidth: 2048, quality: 0.8 });

      if (picked.canceled) return 'Nothing chosen';

      const [{ uri, mimeType }] = picked.assets;

      // The picker writes a PNG when the image has transparency: send it as it is.
      photo.value =
        mimeType === 'image/jpeg'
          ? await cleaned(uri, await fileSystem.readBytes(uri))
          : { uri, mimeType };

      return 'Photo chosen';
    });

  const upload = (chosen: Photo) =>
    attempt(async () => {
      progress.value = 0;

      try {
        const sent = await fileSystem.upload(UPLOAD_URL, chosen.uri, {
          mimeType: chosen.mimeType,
          onProgress: ({ bytes, total }) => (progress.value = total ? bytes / total : 0),
        });

        if (sent.status >= 300) throw new Error(`The server answered ${sent.status}`);
      } finally {
        progress.value = null;
      }

      photo.value = null;

      return 'Uploaded';
    });

  return (
    <SafeArea flex={1} backgroundColor="#000000">
      <Camera ref={camera} flex={1} />
      <VStack padding={16} gap={12} backgroundColor="#111114">
        <HStack gap={12}>
          <Button onPress={take}>Take photo</Button>
          <Button onPress={choose}>Choose from library</Button>
        </HStack>
        <Show when={photo.value}>
          {(chosen) => (
            <HStack gap={12} alignItems="center">
              <Image
                src={chosen.uri}
                width={64}
                height={64}
                borderRadius={8}
                label="Photo to send"
              />
              <Button disabled={progress.value !== null} onPress={() => upload(chosen)}>
                Upload
              </Button>
            </HStack>
          )}
        </Show>
        <Show when={progress.value !== null}>
          <Box height={4} borderRadius={2} backgroundColor="#333338">
            <Box
              height={4}
              borderRadius={2}
              backgroundColor="#0a84ff"
              width={`${(progress.value ?? 0) * 100}%`}
            />
          </Box>
        </Show>
        <Text color="#d0d0dc">{status.value}</Text>
      </VStack>
    </SafeArea>
  );
}
