/**
 * Build-time thumbnails.
 *
 * For every program / website that has a URL and no manual image:
 *   1. try the page's og:image / twitter:image
 *   2. fall back to a screenshot service
 *   3. save it under public/thumbs/<id>.<ext>
 *
 * Results are cached in src/data/thumbs.json (committed), so later builds
 * do not hit the network again. Failures never break the build — the card
 * falls back to a generated gradient placeholder.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const DATA = join(ROOT, 'src', 'data');
const OUT = join(ROOT, 'public', 'thumbs');
const MANIFEST = join(DATA, 'thumbs.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT = 15000;

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(join(DATA, file), 'utf8'));
  } catch {
    return fallback;
  }
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
};

const extFromType = (type = '') => {
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('avif')) return '.avif';
  if (type.includes('gif')) return '.gif';
  if (type.includes('svg')) return '.svg';
  return '.jpg';
};

async function findOgImage(pageUrl) {
  const response = await fetchWithTimeout(pageUrl, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) return null;
  const html = (await response.text()).slice(0, 400000);

  const patterns = [
    /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image|og:image:url|og:image:secure_url|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

async function downloadImage(imageUrl) {
  const response = await fetchWithTimeout(imageUrl, {
    headers: { 'user-agent': UA, accept: 'image/*' },
  });
  if (!response.ok) return null;
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 2500 || buffer.byteLength > 5_000_000) return null;
  return { buffer, ext: extFromType(type) };
}

async function screenshot(url) {
  const target = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200&h=750`;
  // mShots renders on demand: the first hit often returns a tiny placeholder,
  // so give it a couple of chances before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await downloadImage(target).catch(() => null);
    if (result && result.buffer.byteLength >= 9000) return result;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return null;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  if (process.env.SKIP_THUMBS === '1') {
    console.log('[thumbs] skipped (SKIP_THUMBS=1)');
    return;
  }

  const programs = await readJson('programs.json', []);
  const sites = await readJson('sites.json', []);
  const manifest = await readJson('thumbs.json', {});
  const items = [...programs, ...sites].filter(
    (item) => item && item.id && typeof item.url === 'string' && /^https?:\/\//i.test(item.url),
  );

  await mkdir(OUT, { recursive: true });

  let fetched = 0;
  let skipped = 0;

  for (const item of items) {
    if (manifest[item.id] && (await exists(join(ROOT, 'public', manifest[item.id].replace(/^\//, ''))))) {
      skipped++;
      continue;
    }
    if (item.image && item.image.trim()) {
      manifest[item.id] = item.image.trim();
      skipped++;
      continue;
    }

    process.stdout.write(`[thumbs] ${item.id} … `);
    try {
      let asset = null;
      const og = await findOgImage(item.url).catch(() => null);
      if (og) asset = await downloadImage(og).catch(() => null);
      if (!asset) asset = await screenshot(item.url).catch(() => null);
      if (!asset) {
        console.log('no image (placeholder will be used)');
        continue;
      }

      const file = `${item.id}${asset.ext === '.svg' ? '.png' : asset.ext}`;
      await writeFile(join(OUT, file), asset.buffer);
      manifest[item.id] = `/thumbs/${file}`;
      fetched++;
      console.log(`ok (${file})`);
    } catch (error) {
      console.log(`failed (${error instanceof Error ? error.message : 'unknown'})`);
    }
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[thumbs] done — ${fetched} fetched, ${skipped} cached, ${items.length} total`);
}

run().catch((error) => {
  console.warn('[thumbs] unexpected failure, continuing build:', error);
});
