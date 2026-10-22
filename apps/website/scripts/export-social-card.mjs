/** Regenerate the checked-in social preview: npm run social:export. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const website = new URL('../', import.meta.url);
const mark = await sharp(await readFile(new URL('public/kuito-mark.svg', website)))
  .resize(108, 108)
  .png()
  .toBuffer();
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="surface" x2="1" y2="1">
      <stop stop-color="#10111d"/><stop offset="1" stop-color="#22203b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#surface)"/>
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="#a98aff" stroke-opacity=".25"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="196" y="154" fill="#fff" font-size="70" font-weight="700">kuito<tspan fill="#b59aff">.</tspan></text>
    <rect x="900" y="94" width="220" height="48" rx="24" fill="#b59aff" fill-opacity=".12"/>
    <text x="1010" y="125" text-anchor="middle" fill="#d9cdff" font-size="22">iOS + Android</text>
    <text x="80" y="305" fill="#fff" font-size="76" font-weight="700">Native apps.</text>
    <text x="80" y="398" fill="#c4adff" font-size="76" font-weight="700">Web simplicity.</text>
    <path d="M80 470H1120" stroke="#fff" stroke-opacity=".13"/>
    <text x="80" y="538" fill="#c8c6d8" font-size="26">TypeScript · TSX · CSS</text>
    <text x="1120" y="538" text-anchor="end" fill="#c8c6d8" font-size="26">kuito.dev</text>
  </g>
</svg>`;

await sharp(Buffer.from(artwork))
  .composite([{ input: mark, left: 72, top: 66 }])
  .png()
  .toFile(fileURLToPath(new URL('public/social-card.png', website)));

console.log('Exported public/social-card.png (1200 × 630).');
