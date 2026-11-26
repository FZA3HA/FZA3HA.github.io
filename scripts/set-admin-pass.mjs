/**
 * Sets the admin panel passphrase.
 *
 *   npm run admin:pass "كلمة السر الجديدة"
 *
 * It writes src/data/lock.json with a salted PBKDF2-SHA256 hash. That file is
 * the *only* thing the public site knows about the password — the passphrase
 * itself never leaves your machine. /admin/ refuses to show anything until the
 * hash matches, and the same passphrase unlocks the encrypted GitHub token.
 *
 * Commit src/data/lock.json after running this, then let the site rebuild.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ITER = 600000;
const KEYLEN = 32;

const password = process.argv.slice(2).join(' ').trim();

if (!password) {
  console.error('الاستخدام: npm run admin:pass "كلمة السر"');
  process.exit(1);
}

if (password.length < 10) {
  console.error('كلمة السر قصيرة — ١٠ حروف على الأقل.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITER, KEYLEN, 'sha256');

const payload = {
  v: 1,
  iter: ITER,
  salt: salt.toString('base64'),
  hash: hash.toString('base64'),
  set: new Date().toISOString().slice(0, 10),
};

const target = join(process.cwd(), 'src', 'data', 'lock.json');
await writeFile(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`تم. كلمة السر اتظبطت — ${target}`);
console.log('اعمل commit للملف ده عشان تتفعّل على الموقع.');
