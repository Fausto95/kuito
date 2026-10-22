/**
 * Export the Kuito caracal master to native launcher and splash PNGs.
 *
 * This is an intentional, explicit build step. Apps can override all assets.
 * Run: npm run brand:export (from apps/website).
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const website = resolve(here, '..');
const root = resolve(website, '../..');
const assets = resolve(root, 'templates/app/assets');
const exported = resolve(root, 'branding/generated');
const source = await readFile(resolve(website, 'public/kuito-mark.svg'));

await mkdir(assets, { recursive: true });
await mkdir(exported, { recursive: true });

async function mark(size, width) {
  const foreground = await sharp(source).resize(width, width).png().toBuffer();
  const offset = Math.round((size - width) / 2);

  return sharp({
    create: { width: size, height: size, channels: 4, background: '#00000000' },
  })
    .composite([{ input: foreground, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function icon(path, background, width = 810) {
  const overlay = await mark(1024, width);

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background },
  })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .flatten()
    .png()
    .toFile(path);
}

await icon(resolve(assets, 'icon.png'), '#111319');
await icon(resolve(assets, 'icon-staging.png'), '#29214e');

const transparentLogo = await mark(1024, 850);

await sharp(transparentLogo).png().toFile(resolve(assets, 'splash.png'));

await sharp(transparentLogo).png().toFile(resolve(exported, 'splash-mark.png'));
await icon(resolve(exported, 'icon-light.png'), '#f6f4ff');
await icon(resolve(exported, 'icon-dark.png'), '#111319');

// Android 108dp adaptive icons are masked to 72dp. Inset the logo deliberately.
await sharp(await mark(1024, 615))
  .png()
  .toFile(resolve(exported, 'android-adaptive-foreground.png'));

await sharp(await mark(1024, 615))
  .greyscale()
  .png()
  .toFile(resolve(exported, 'android-monochrome-foreground.png'));

console.log('Exported Kuito branding to templates/app/assets and branding/generated.');
