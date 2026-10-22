// Measure a remote image.
import { image } from 'kuito';

function fit(size: image.ImageSize, maxWidth: number): image.ImageSize {
  const scale = Math.min(1, maxWidth / size.width);

  return { width: size.width * scale, height: size.height * scale };
}

const size = fit(await image.prefetch('https://example.com/map.png'), 320);
