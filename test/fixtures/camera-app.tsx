import { signal, Show, Camera, cameraRef } from 'kuito';

// The test drives the camera as an app would, from inside the kernel.
export default function App() {
  const shown = signal(true);
  const facing = signal<'back' | 'front'>('back');
  const camera = cameraRef();
  const events: unknown[] = [];

  Object.assign(globalThis, {
    camera,
    events,
    flip() {
      facing.value = facing.value === 'back' ? 'front' : 'back';
    },
    toggle() {
      shown.value = !shown.value;
    },
  });

  return (
    <Show when={shown.value}>
      <Camera
        id="camera"
        ref={camera}
        flex={1}
        facing={facing.value}
        flash="auto"
        torch={false}
        zoom={0.25}
        mode="video"
        barcodes={['qr', 'ean13']}
        onReady={() => events.push(['ready'])}
        onError={(event) => events.push(['error', event.code, event.message])}
        onBarcode={(event) => events.push(['barcode', event.format, event.data])}
      />
    </Show>
  );
}
