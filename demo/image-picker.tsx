import {
  Button,
  Image,
  SafeArea,
  Scroll,
  VStack,
  Text,
  signal,
  Show,
  fileSystem,
  mediaPicker,
  type MediaAsset,
  type MediaPickerResult,
} from 'kuito';

const describe = ({ type, width, height, fileName, fileSize, duration }: MediaAsset) =>
  `${type} ${width}×${height} ${fileName} ${Math.round(fileSize / 1024)} KB` +
  (duration === undefined ? '' : ` ${duration / 1000}s`);

/** Picks and captures with mediaPicker and shows what came back. */
export default function App() {
  const status = signal('nothing picked yet');
  const first = signal('');
  const second = signal('');

  const run = (label: string, launch: () => Promise<MediaPickerResult>) => () => {
    status.value = label + '…';

    launch().then(
      async (result) => {
        console.log('mediaPicker ' + label + ': ' + JSON.stringify(result));

        if (result.canceled) return void (status.value = label + ': canceled');

        const images = result.assets.filter((asset) => asset.type === 'image');
        const info = await fileSystem.info(result.assets[0].uri);

        first.value = images[0]?.uri ?? '';
        second.value = images[1]?.uri ?? '';

        status.value =
          `${label}: ${result.assets.length} picked, fileSystem sees ` +
          `${info.exists ? 'the file' : 'nothing'}\n` +
          result.assets.map(describe).join('\n');
      },
      (error: Error & { code?: string }) => {
        console.log('mediaPicker ' + label + ' failed: ' + error.message);
        status.value = `${label}: ${error.code ?? ''} ${error.message}`;
      },
    );
  };

  return (
    <SafeArea flex={1} backgroundColor="#0b0b10">
      <Scroll>
        <VStack gap={10} padding={20}>
          <Text color="#ffffff" fontSize={24} fontWeight="bold">
            Image Picker
          </Text>
          <Button
            id="pick-one"
            onPress={run('one photo', () => mediaPicker.pick({ quality: 0.7 }))}
          >
            Pick a photo
          </Button>
          <Button
            id="pick-several"
            onPress={run('several', () =>
              mediaPicker.pick({
                mediaTypes: ['images', 'videos'],
                selectionLimit: 0,
                maxWidth: 800,
              }),
            )}
          >
            Pick several, 800 px wide at most
          </Button>
          <Button
            id="pick-video"
            onPress={run('video', () => mediaPicker.pick({ mediaTypes: 'videos' }))}
          >
            Pick a video
          </Button>
          <Button
            id="pick-edit"
            onPress={run('crop', () => mediaPicker.pick({ allowsEditing: true }))}
          >
            Pick and crop (iOS)
          </Button>
          <Button
            id="take-photo"
            onPress={run('camera', () => mediaPicker.capture({ quality: 0.8 }))}
          >
            Take a photo
          </Button>
          <Button
            id="record-video"
            onPress={run('recording', () => mediaPicker.capture({ mediaTypes: 'videos' }))}
          >
            Record a video
          </Button>
          <Text id="status" color="#d0d0dc">
            {status.value}
          </Text>
          <Show when={() => first.value !== ''}>
            <Image id="first" src={{ uri: first.value }} aspectRatio={1.5} placeholder="#1c1c25" />
          </Show>
          <Show when={() => second.value !== ''}>
            <Image
              id="second"
              src={{ uri: second.value }}
              aspectRatio={1.5}
              placeholder="#1c1c25"
            />
          </Show>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
