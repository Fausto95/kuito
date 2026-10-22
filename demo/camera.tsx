import {
  Button,
  Image,
  SafeArea,
  VStack,
  Text,
  signal,
  Show,
  Camera,
  cameraRef,
  fileSystem,
  type CameraFacing,
  type CameraMode,
} from 'kuito';

// The camera end to end (docs/camera.md): a preview that flips, zooms and
// lights up; a picture shown in an Image; a short video recorded; the
// preview paused, and the camera unmounted and remounted. The log shows
// onReady, onError and scanned codes.

const failed = (error: Error & { code?: string }) =>
  `${error.code ?? error.name}: ${error.message}`;

export default function CameraDemo() {
  const camera = cameraRef();
  const shown = signal(true);
  const facing = signal<CameraFacing>('back');
  const mode = signal<CameraMode>('picture');
  const torch = signal(false);
  const zoom = signal(0);
  const recording = signal(false);
  const photo = signal<string | null>(null);
  const log = signal<string[]>([]);
  const write = (line: string) => (log.value = [line, ...log.value].slice(0, 6));

  const takePicture = async () => {
    try {
      const picture = await camera.current?.takePicture({ quality: 0.8 });

      if (!picture) return;

      const info = await fileSystem.info(picture.uri);

      photo.value = picture.uri;
      write(`picture ${picture.width}×${picture.height}, ${info.exists ? info.size : 0} bytes`);
    } catch (error) {
      write(failed(error as Error));
    }
  };

  const record = async () => {
    const current = camera.current;

    if (!current) return;

    try {
      if (recording.value) {
        await current.stopRecording();

        return;
      }

      recording.value = true;
      write('recording…');

      const video = await current.startRecording({ maxDuration: 10 });
      const info = await fileSystem.info(video.uri);

      write(`video ${video.duration.toFixed(1)}s, ${info.exists ? info.size : 0} bytes`);
    } catch (error) {
      write(failed(error as Error));
    } finally {
      recording.value = false;
    }
  };

  const attempt = (work: Promise<void> | undefined) =>
    void work?.catch((error: Error) => write(failed(error)));

  return (
    <SafeArea flex={1} backgroundColor="#101014">
      <VStack flex={1} padding={12} gap={8}>
        <VStack id="camera-frame" flex={1} backgroundColor="#000">
          <Show when={shown.value}>
            <Camera
              id="camera"
              ref={camera}
              flex={1}
              facing={facing.value}
              mode={mode.value}
              torch={torch.value}
              zoom={zoom.value}
              barcodes={['qr', 'ean13']}
              onReady={() => write(`ready (${facing.value}, ${mode.value})`)}
              onError={(event) => write(`error ${event.code}: ${event.message}`)}
              onBarcode={(event) => write(`${event.format}: ${event.data}`)}
            />
          </Show>
        </VStack>
        <Text id="camera-state" color="#d0d0dc">
          {camera.ready.value ? 'ready' : (camera.error.value?.message ?? 'starting…')}
        </Text>
        <VStack flexDirection="row" gap={8} flexWrap="wrap">
          <Button
            id="flip"
            onPress={() => (facing.value = facing.value === 'back' ? 'front' : 'back')}
          >
            Flip
          </Button>
          <Button id="torch" onPress={() => (torch.value = !torch.value)}>
            Torch
          </Button>
          <Button id="zoom" onPress={() => (zoom.value = zoom.value ? 0 : 0.5)}>
            Zoom
          </Button>
          <Button
            id="mode"
            onPress={() => (mode.value = mode.value === 'picture' ? 'video' : 'picture')}
          >
            {mode.value === 'picture' ? 'Video mode' : 'Picture mode'}
          </Button>
          <Button id="shoot" onPress={() => void takePicture()}>
            Picture
          </Button>
          <Button id="record" onPress={() => void record()}>
            {recording.value ? 'Stop' : 'Record'}
          </Button>
          <Button id="pause" onPress={() => attempt(camera.current?.pausePreview())}>
            Pause
          </Button>
          <Button id="resume" onPress={() => attempt(camera.current?.resumePreview())}>
            Resume
          </Button>
          <Button id="mount" onPress={() => (shown.value = !shown.value)}>
            {shown.value ? 'Unmount' : 'Mount'}
          </Button>
        </VStack>
        <VStack flexDirection="row" gap={8} height={120}>
          <Show when={photo.value}>
            {(uri) => <Image id="photo" src={{ uri }} width={90} height={120} />}
          </Show>
          <Text flex={1} color="#d0d0dc" fontSize={12}>
            {log.value.join('\n')}
          </Text>
        </VStack>
      </VStack>
    </SafeArea>
  );
}
