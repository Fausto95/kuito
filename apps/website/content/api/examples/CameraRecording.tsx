// Save the result of recording a video.
import { Button, Camera, cameraRef, fileSystem, type CameraRecording } from 'kuito';

async function keep(video: CameraRecording) {
  // Recordings land in the cache, which the system may clear: move the keepers.
  const to = `${fileSystem.documents}clip-${Date.now()}.mp4`;

  await fileSystem.move(video.uri, to);

  return to;
}

function Recorder() {
  const camera = cameraRef();

  return (
    <>
      <Camera ref={camera} mode="video" flex={1} />
      <Button onPress={() => void camera.current?.startRecording().then(keep)}>Record</Button>
      <Button onPress={() => void camera.current?.stopRecording()}>Stop</Button>
    </>
  );
}
