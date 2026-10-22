// Choose capture quality and output.
import { Button, Camera, cameraRef, fileSystem, type PictureOptions } from 'kuito';

// Smaller files for an upload, with the bytes in memory so nothing reads the file again.
const forUpload: PictureOptions = { quality: 0.6, bytes: true };

function Uploader() {
  const camera = cameraRef();

  const send = async () => {
    const picture = await camera.current?.takePicture(forUpload);

    if (!picture?.bytes) return;
    await fetch('https://api.example.com/photos', { method: 'POST', body: picture.bytes });
    await fileSystem.delete(picture.uri);
  };

  return (
    <>
      <Camera ref={camera} flex={1} />
      <Button onPress={send}>Send</Button>
    </>
  );
}
