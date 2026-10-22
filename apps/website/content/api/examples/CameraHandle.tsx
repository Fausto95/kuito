// Pause and resume a camera preview.
import { Button, Camera, ref, type CameraHandle } from 'kuito';

function Scanner() {
  // A plain ref holds the handle; cameraRef() adds ready and error signals.
  const camera = ref<CameraHandle>();

  return (
    <>
      <Camera ref={camera} flex={1} />
      <Button onPress={() => void camera.current?.pausePreview()}>Pause</Button>
      <Button onPress={() => void camera.current?.resumePreview()}>Resume</Button>
    </>
  );
}
