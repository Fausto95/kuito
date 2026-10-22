import { Button, Camera, cameraRef, type RecordingOptions } from 'kuito';

// A clip stops on its own after 15 seconds.
const clip: RecordingOptions = { maxDuration: 15 };

function Clip() {
  const camera = cameraRef();

  const record = async () => {
    const video = await camera.current?.startRecording(clip);

    console.log(video?.uri, video?.duration);
  };

  return (
    <>
      <Camera ref={camera} mode="video" flex={1} />
      <Button onPress={record}>Record</Button>
    </>
  );
}
