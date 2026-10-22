import { Button, Camera, Image, cameraRef, signal, type CameraPicture } from 'kuito';

function Snap() {
  const camera = cameraRef();
  const last = signal<CameraPicture | null>(null);

  const snap = async () => {
    last.value = (await camera.current?.takePicture({ quality: 0.8 })) ?? null;
  };

  return (
    <>
      <Camera ref={camera} flex={1} />
      <Button disabled={!camera.ready.value} onPress={snap}>
        Take picture
      </Button>
      {last.value && (
        <Image src={last.value.uri} width={80} aspectRatio={last.value.width / last.value.height} />
      )}
    </>
  );
}
