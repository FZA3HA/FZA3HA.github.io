/**
 * One-time migration: encrypts the plain JSON data files in place.
 *
 *   DATA_KEY="..." node scripts/encrypt-data.mjs
 *
 * After running, src/data/*.json contain ciphertext. Commit them.
 * Keep a backup first if unsure: copy src/data to D:\Temp\data-backup.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, pbkdf2Sync } from 'node:crypto';

const ROOT = process.cwd();
const DIR = join(ROOT, 'src', 'data');
const FILES = ['site.json', 'programs.json', 'sites.json', 'links.json'];

async function main() {
  const passphrase = (process.env.DATA_KEY || (existsSync(join(ROOT, '.data-key')) ? (await readFile(join(ROOT, '.data-key'), 'utf8')).trim() : '')).trim();
  if (!passphrase) {
    console.error('DATA_KEY missing.');
    process.exit(1);
  }

  for (const file of FILES) {
    const raw = await readFile(join(DIR, file), 'utf8');
    const parsed = JSON.parse(raw);

    // skip if already encrypted
    if (parsed && parsed.salt && parsed.iv && parsed.data) {
      console.log(`[encrypt] ${file} … already encrypted, skipped`);
      continue;
    }

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = pbkdf2Sync(passphrase, salt, 250000, 32, 'sha256');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(parsed, null, 2) + '\n', 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();
    const blob = Buffer.concat([body, tag]);

    const out = {
      v: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      data: blob.toString('base64'),
    };
    await writeFile(join(DIR, file), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`[encrypt] ${file} … ok`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
