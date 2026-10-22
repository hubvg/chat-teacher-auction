// Makes the browser and home-screen icons in public/ from the school's square logo
// (config.logos.mark, public/brand/school-mark.png): favicon.ico (16/32/48),
// apple-touch-icon.png and the web-app icons. Run `npm run icons` after replacing
// the logo. The files are committed, so builds don't need this.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'public');
const source = join(out, 'brand', 'school-mark.png');

const logo = `data:image/png;base64,${(await readFile(source)).toString('base64')}`;

// The logo drawn into a square canvas. `rounded` is for browser tabs; home-screen
// icons stay square because iOS and Android apply their own mask.
const canvas = (size, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c"><rect width="${size}" height="${size}" rx="${rounded ? size * 0.18 : 0}"/></clipPath></defs>
  <image width="${size}" height="${size}" clip-path="url(#c)" href="${logo}" xlink:href="${logo}" preserveAspectRatio="xMidYMid slice"/>
</svg>`;

const png = (size, rounded) => new Resvg(canvas(size, rounded)).render().asPng();

/** ICO container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

await writeFile(join(out, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, data: png(size, true) }))));
await writeFile(join(out, 'apple-touch-icon.png'), png(180, false));
await writeFile(join(out, 'icon-192.png'), png(192, false));
await writeFile(join(out, 'icon-512.png'), png(512, false));
console.log('Icons written to public/ from', source);
