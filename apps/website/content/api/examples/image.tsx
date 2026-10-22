import { image } from 'kuito';

const { width, height } = await image.prefetch('https://example.com/cover.jpg');

const aspectRatio = width / height; // size the Image before it loads
