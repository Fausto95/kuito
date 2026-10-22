import { HStack, Image, SafeArea, Scroll } from 'kuito';

/**
 * The image benchmark (docs/performance.md#images): twelve 3000 × 2000
 * photos in 100-point squares. It logs how long they took to show; peak
 * memory is read from the process (Instruments, `footprint`, `dumpsys
 * meminfo`).
 */
const PHOTOS = Array.from(
  { length: 12 },
  (_, index) => `https://picsum.photos/id/${10 + index}/3000/2000`,
);

const started = Date.now();
let loaded = 0;

function counted() {
  loaded += 1;

  if (loaded === PHOTOS.length)
    console.log(`image-grid: ${loaded} images in ${Date.now() - started} ms`);
}

export default function ImageGrid() {
  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <Scroll flex={1}>
        <HStack flexWrap="wrap" gap={8} padding={8}>
          {PHOTOS.map((uri) => (
            <Image
              src={uri}
              width={100}
              height={100}
              placeholder="#e5e5ea"
              onLoad={counted}
              onError={(event) => console.log(`image-grid: ${uri} failed: ${event.error}`)}
            />
          ))}
        </HStack>
      </Scroll>
    </SafeArea>
  );
}
