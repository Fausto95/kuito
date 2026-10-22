// Capture a profile photo with the system camera UI.
import { Button, Image, VStack, mediaPicker, signal } from 'kuito';

export function ProfilePhoto() {
  const uri = signal<string | null>(null);
  async function capture() {
    try {
      const result = await mediaPicker.capture({ mediaTypes: ['images'] });
      if (!result.canceled) uri.value = result.assets[0]?.uri ?? null;
    } catch (error) {
      console.error('Camera unavailable', error);
    }
  }
  return (
    <VStack>
      <Button onPress={() => void capture()}>Take profile photo</Button>
      {uri.value ? <Image src={uri.value} width={96} height={96} /> : null}
    </VStack>
  );
}
