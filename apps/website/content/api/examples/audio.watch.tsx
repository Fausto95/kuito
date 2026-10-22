// Show when a phone call interrupts audio.
import { Text, audio, signal, type AudioInterruption } from 'kuito';

export function AudioStatus() {
  const interruption = signal<AudioInterruption | null>(null);
  audio.watch('interruption', (event) => {
    interruption.value = event;
  });
  return <Text>{interruption.value ? JSON.stringify(interruption.value) : 'No interruption'}</Text>;
}
