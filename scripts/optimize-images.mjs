/**
 * One-off asset optimisation (keeps the repo light).
 * Usage: node scripts/optimize-images.mjs <source.png>
 */
import sharp from 'sharp';
import { resolve, join } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/optimize-images.mjs <source.png>');
  process.exit(1);
}

const out = join(process.cwd(), 'public');
const src = resolve(source);

await sharp(src).resize(512, 512, { fit: 'contain' }).webp({ quality: 84 }).toFile(join(out, 'logo.webp'));
await sharp(src).resize(256, 256, { fit: 'contain' }).webp({ quality: 84 }).toFile(join(out, 'logo-256.webp'));

const logo = await sharp(src).resize(420, 420, { fit: 'contain' }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#050607' } })
  .composite([{ input: logo, gravity: 'centre' }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(join(out, 'og.jpg'));

console.log('done');
