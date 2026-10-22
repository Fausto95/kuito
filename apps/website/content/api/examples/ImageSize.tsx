import { Image, image, signal, type ImageSize } from 'kuito';

const natural = signal<ImageSize | null>(null);

image.prefetch('https://example.com/banner.jpg').then((size) => (natural.value = size));

<Image
  src="https://example.com/banner.jpg"
  width="100%"
  aspectRatio={natural.value ? natural.value.width / natural.value.height : 16 / 9}
/>;
