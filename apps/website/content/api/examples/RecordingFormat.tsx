// Configure a component-owned voice recorder.
import { Button, audio, type RecordingFormat, type RecordingQuality } from 'kuito';

export function Memo() {
  const format: RecordingFormat = 'aac';
  const quality: RecordingQuality = 'high';
  const recorder = audio.recorder({ format, quality });
  return <Button onPress={() => void recorder.start().catch(console.error)}>Record</Button>;
}
// Declare microphone permission; finish the file with recorder.stop().
