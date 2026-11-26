/**
 * Build-time decryption of the (encrypted) content data.
 *
 * The committed files under src/data/*.json are encrypted with AES-256-GCM
 * (key derived from DATA_KEY via PBKDF2). This script decrypts them into
 * src/data-plain/*.json, which is what Astro imports. The plain directory is
 * gitignored, so the repository only ever contains ciphertext.
 *
 * DATA_KEY can be provided via env var or a local (gitignored) .data-key file.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src', 'data');
const OUT = join(ROOT, 'src', 'data-plain');
const FILES = ['site.json', 'programs.json', 'sites.json', 'links.json'];

async function main() {
  const passphrase = (process.env.DATA_KEY || (existsSync(join(ROOT, '.data-key')) ? (await readFile(join(ROOT, '.data-key'), 'utf8')).trim() : '')).trim();
  if (!passphrase) {
    console.error('DATA_KEY missing. Set env var DATA_KEY or create .data-key file.');
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });

  for (const file of FILES) {
    const raw = await readFile(join(SRC, file), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`[decrypt] ${file}: invalid JSON`);
      process.exit(1);
    }

    // Already plain? (backward compat / first run)
    if (!parsed || typeof parsed !== 'object' || !parsed.salt || !parsed.iv || !parsed.data) {
      await writeFile(join(OUT, file), JSON.stringify(parsed, null, 2) + '\n', 'utf8');
      console.log(`[decrypt] ${file} … plain (copied)`);
      continue;
    }

    const salt = Buffer.from(parsed.salt, 'base64');
    const iv = Buffer.from(parsed.iv, 'base64');
    const ct = Buffer.from(parsed.data, 'base64');
    const key = pbkdf2Sync(passphrase, salt, 250000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    // auth tag is appended by our encrypt format; we store it separately? We'll append 16 bytes.
    // Format: data = ciphertext + 16-byte auth tag
    const tag = ct.subarray(ct.length - 16);
    const body = ct.subarray(0, ct.length - 16);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    const json = JSON.parse(plain);
    await writeFile(join(OUT, file), JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`[decrypt] ${file} … ok`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
