/* ============================================================
   FZA3HA admin — static, token-based content editor.
   The GitHub token never leaves this browser: it is encrypted
   with the admin password (PBKDF2 + AES-GCM) and kept in
   localStorage. The repo itself contains no secrets.
   ============================================================ */

type Kind = 'programs' | 'sites' | 'links';
type AnyRecord = Record<string, any>;

interface Config {
  owner: string;
  repo: string;
  branch: string;
  username: string;
  salt: string;
  iv: string;
  blob: string;
}

interface FileState {
  sha: string;
  data: any;
}

const LS_KEY = 'fz:admin:v1';

const FILES: Record<'programs' | 'sites' | 'links' | 'site', string> = {
  programs: 'src/data/programs.json',
  sites: 'src/data/sites.json',
  links: 'src/data/links.json',
  site: 'src/data/site.json',
};

const KIND_LABEL: Record<Kind, { title: string; one: string; hint: string }> = {
  programs: {
    title: 'البرامج',
    one: 'برنامج',
    hint: 'كل برنامج أو أداة بتظهر في قسم «برامجي».',
  },
  sites: {
    title: 'المواقع',
    one: 'موقع',
    hint: 'كل موقع بتظهر في قسم «مواقعي» بإطار متصفح وصورة أوتوماتيك.',
  },
  links: {
    title: 'اللينكات',
    one: 'لينك',
    hint: 'شبكة الكروت اللي بتظهر في قسم «لينكاتي».',
  },
};

const ICONS = ['link', 'github', 'instagram', 'linkedin', 'x', 'youtube', 'telegram', 'whatsapp', 'mail', 'globe', 'code', 'external', 'download', 'star', 'user'];

const state = {
  config: null as Config | null,
  token: null as string | null,
  branch: 'main',
  tab: 'programs' as 'programs' | 'sites' | 'links' | 'profile' | 'json',
  files: {} as Record<string, FileState>,
  editor: null as null | { kind: Kind; index: number | null },
};

/* ---------- tiny helpers ---------- */
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T =>
  root.querySelector(sel) as T;

const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll(sel)) as T[];

const te = new TextEncoder();
const td = new TextDecoder();

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const toB64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const fromB64 = (value: string): Uint8Array => {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const getPath = (obj: AnyRecord, path: string): any =>
  path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);

const setPath = (obj: AnyRecord, path: string, value: any): void => {
  const keys = path.split('.');
  let current = obj;
  keys.slice(0, -1).forEach((key) => {
    if (current[key] == null || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  current[keys[keys.length - 1]] = value;
};

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(message: string, tone: 'ok' | 'err' | '' = ''): void {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.show = '1';
  if (tone) el.dataset.state = tone;
  else delete el.dataset.state;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    delete el.dataset.show;
  }, 3800);
}

/* ---------- crypto ---------- */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecret(secret: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(secret));
  return { salt: toB64(salt), iv: toB64(iv), blob: toB64(new Uint8Array(cipher)) };
}

async function decryptSecret(config: Config, password: string): Promise<string> {
  const key = await deriveKey(password, fromB64(config.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(config.iv) as unknown as BufferSource },
    key,
    fromB64(config.blob) as unknown as BufferSource,
  );
  return td.decode(plain);
}

/* ---------- config ---------- */
function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Config;
    if (!parsed?.owner || !parsed?.repo || !parsed?.blob) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistConfig(config: Config): void {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

/* ---------- github ---------- */
async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  if (!state.token || !state.config) throw new Error('مش مسجل دخول');
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}

async function verifyRepo(owner: string, repo: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 401) throw new Error('التوكن غير صالح أو منتهي.');
  if (response.status === 404) throw new Error('الريبو مش موجود، أو التوكن مش عنده صلاحية عليه.');
  if (!response.ok) throw new Error(`GitHub رجع خطأ (${response.status}).`);
  const data = (await response.json()) as { default_branch?: string; permissions?: { push?: boolean } };
  if (data.permissions && data.permissions.push === false) {
    throw new Error('التوكن للقراءة فقط — لازم صلاحية Contents = Read and write.');
  }
  return data;
}

async function loadFile(key: keyof typeof FILES): Promise<FileState> {
  const path = FILES[key];
  if (state.files[path]) return state.files[path];
  if (!state.config) throw new Error('مفيش إعدادات');

  const response = await gh(
    `/repos/${state.config.owner}/${state.config.repo}/contents/${path}?ref=${encodeURIComponent(state.branch)}`,
  );
  if (!response.ok) throw new Error(`تعذّر تحميل ${path} (${response.status})`);
  const json = (await response.json()) as { sha: string; content: string };
  const text = td.decode(fromB64(json.content));
  const data = JSON.parse(text);
  state.files[path] = { sha: json.sha, data };
  return state.files[path];
}

async function saveFile(path: string, message?: string): Promise<void> {
  if (!state.config) throw new Error('مفيش إعدادات');
  const file = state.files[path];
  if (!file) throw new Error('الملف مش متحمّل');

  const content = toB64(te.encode(JSON.stringify(file.data, null, 2) + '\n'));
  const response = await gh(`/repos/${state.config.owner}/${state.config.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || `content: update ${path.split('/').pop()}`,
      content,
      sha: file.sha,
      branch: state.branch,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`فشل الحفظ (${response.status}) ${detail.slice(0, 120)}`);
  }

  const result = (await response.json()) as { content: { sha: string } };
  file.sha = result.content.sha;
}

async function uploadImage(file: File, name: string): Promise<string> {
  if (!state.config) throw new Error('مفيش إعدادات');

  const dataUrl = await downscale(file);
  const comma = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(comma + 1);
  const isWebp = dataUrl.slice(0, comma).includes('webp');
  const ext = isWebp ? 'webp' : 'jpg';
  const slug = slugify(name) || 'image';
  const path = `public/uploads/${slug}-${Date.now().toString(36)}.${ext}`;

  const response = await gh(`/repos/${state.config.owner}/${state.config.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `asset: add ${path.split('/').pop()}`, content: base64, branch: state.branch }),
  });

  if (!response.ok) throw new Error(`فشل رفع الصورة (${response.status})`);
  return '/' + path.replace(/^public\//, '');
}

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas غير متاح');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.86);
}

/* ---------- screens ---------- */
const screens = {
  setup: $('#screen-setup'),
  login: $('#screen-login'),
  dash: $('#screen-dash'),
};

function show(screen: 'setup' | 'login' | 'dash'): void {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== screen;
  });
  $('#lockBtn').hidden = screen !== 'dash';
  const repoInfo = $('#repoInfo');
  repoInfo.hidden = screen !== 'dash';
  if (screen === 'dash' && state.config) {
    repoInfo.textContent = `${state.config.owner}/${state.config.repo} · ${state.branch}`;
  }
}

/* ---------- setup ---------- */
const setupForm = $('#setupForm') as HTMLFormElement;
const setupStatus = $('#setupStatus');

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setupStatus.dataset.state = '';
  setupStatus.textContent = 'بيتحقق من التوكن...';

  const form = new FormData(setupForm);
  const owner = String(form.get('owner') || '').trim();
  const repo = String(form.get('repo') || '').trim();
  const branch = String(form.get('branch') || '').trim() || 'main';
  const token = String(form.get('token') || '').trim();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const password2 = String(form.get('password2') || '');

  if (!owner || !repo || !token || !username) {
    setupStatus.textContent = 'كمّل كل الحقول المطلوبة.';
    setupStatus.dataset.state = 'err';
    return;
  }
  if (password.length < 8) {
    setupStatus.textContent = 'كلمة المرور لازم 8 حروف على الأقل.';
    setupStatus.dataset.state = 'err';
    return;
  }
  if (password !== password2) {
    setupStatus.textContent = 'كلمتين المرور مش متطابقين.';
    setupStatus.dataset.state = 'err';
    return;
  }

  try {
    const info = await verifyRepo(owner, repo, token);
    const finalBranch = form.get('branch') ? branch : info.default_branch || 'main';
    const encrypted = await encryptSecret(token, password);
    const config: Config = { owner, repo, branch: finalBranch, username, ...encrypted };
    persistConfig(config);

    state.config = config;
    state.branch = finalBranch;
    state.token = token;

    setupStatus.textContent = 'تم الحفظ.';
    setupStatus.dataset.state = 'ok';
    show('dash');
    await openTab('programs');
  } catch (error) {
    setupStatus.textContent = error instanceof Error ? error.message : 'حصل خطأ.';
    setupStatus.dataset.state = 'err';
  }
});

/* ---------- login ---------- */
const loginForm = $('#loginForm') as HTMLFormElement;
const loginStatus = $('#loginStatus');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.config) return;
  loginStatus.dataset.state = '';
  loginStatus.textContent = 'بيفتح...';

  const form = new FormData(loginForm);
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');

  if (username.toLowerCase() !== state.config.username.toLowerCase()) {
    loginStatus.textContent = 'اسم المستخدم أو كلمة المرور غلط.';
    loginStatus.dataset.state = 'err';
    return;
  }

  let token = '';
  try {
    token = await decryptSecret(state.config, password);
  } catch {
    loginStatus.textContent = 'كلمة المرور غلط.';
    loginStatus.dataset.state = 'err';
    return;
  }

  try {
    await verifyRepo(state.config.owner, state.config.repo, token);
  } catch (error) {
    loginStatus.textContent =
      error instanceof Error
        ? `كلمة المرور صح، بس GitHub رفض التوكن: ${error.message}`
        : 'كلمة المرور صح، بس GitHub رفض التوكن.';
    loginStatus.dataset.state = 'err';
    return;
  }

  state.token = token;
  state.branch = state.config.branch || 'main';
  loginStatus.textContent = '';
  loginStatus.dataset.state = '';
  show('dash');
  await openTab('programs');
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('هتتمسح إعدادات اللوحة والتوكن المشفّر من الجهاز ده. متأكد؟')) return;
  localStorage.removeItem(LS_KEY);
  state.config = null;
  state.token = null;
  state.files = {};
  location.reload();
});

$('#lockBtn').addEventListener('click', () => {
  state.token = null;
  state.files = {};
  const password = loginForm.querySelector<HTMLInputElement>('[name="password"]');
  if (password) password.value = '';
  show('login');
});

/* ---------- dashboard: tabs ---------- */
const panel = $('#panel');

async function openTab(tab: typeof state.tab): Promise<void> {
  state.tab = tab;
  $$('#tabs [data-tab]').forEach((button) => {
    button.setAttribute('aria-current', String(button.dataset.tab === tab));
  });

  panel.innerHTML = '<div class="a-card"><p class="a-sub">بيتحمّل…</p></div>';

  try {
    if (tab === 'programs' || tab === 'sites' || tab === 'links') await loadFile(tab);
    else await loadFile('site');

    if (tab === 'profile') renderProfile();
    else if (tab === 'json') renderJson();
    else renderList(tab);
  } catch (error) {
    panel.innerHTML = `<div class="a-card"><h2>مشكلة</h2><p class="a-sub">${
      error instanceof Error ? escapeHtml(error.message) : 'خطأ غير معروف'
    }</p><div class="a-actions"><button class="a-btn" type="button" data-action="retry">جرّب تاني</button></div></div>`;
  }
}

$$('#tabs [data-tab]').forEach((button) => {
  button.addEventListener('click', () => openTab(button.dataset.tab as typeof state.tab));
});

/* ---------- dashboard: lists ---------- */
function projectFields(): Array<{ key: string; label: string; type?: string; ltr?: boolean; options?: string[] }> {
  return [
    { key: 'name.ar', label: 'الاسم (عربي)' },
    { key: 'name.en', label: 'الاسم (إنجليزي)', ltr: true },
    { key: 'desc.ar', label: 'الوصف (عربي)', type: 'textarea' },
    { key: 'desc.en', label: 'الوصف (إنجليزي)', type: 'textarea', ltr: true },
    { key: 'url', label: 'رابط الموقع / التحميل', ltr: true },
    { key: 'repo', label: 'رابط الكود (اختياري)', ltr: true },
    { key: 'year', label: 'السنة', ltr: true },
    { key: 'tags', label: 'الوسوم — بفاصلة (Python, CLI)', ltr: true },
    { key: 'image', label: 'صورة الغلاف (فاضية = أوتوماتيك)', type: 'image' },
    { key: 'demo', label: 'بيانات تجريبية (بتظهر عليها شارة «نموذج»)', type: 'checkbox' },
  ];
}

function linkFields() {
  return [
    { key: 'title.ar', label: 'الاسم (عربي)' },
    { key: 'title.en', label: 'الاسم (إنجليزي)', ltr: true },
    { key: 'desc.ar', label: 'وصف قصير (عربي)' },
    { key: 'desc.en', label: 'وصف قصير (إنجليزي)', ltr: true },
    { key: 'url', label: 'الرابط', ltr: true },
    { key: 'icon', label: 'الأيقونة', type: 'select', options: ICONS },
  ];
}

function renderList(kind: Kind): void {
  const path = FILES[kind];
  const list = state.files[path].data as AnyRecord[];
  const label = KIND_LABEL[kind];

  const rows = list.length
    ? list
        .map((item, index) => {
          const title = kind === 'links' ? item.title?.ar || item.title?.en || '' : item.name?.ar || item.name?.en || '';
          const meta = item.url || '';
          const thumb = item.image || '';
          return `<div class="a-item">
            ${
              thumb
                ? `<img class="a-item__thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" />`
                : `<span class="a-item__thumb a-item__thumb--empty">${escapeHtml(title.slice(0, 2) || '—')}</span>`
            }
            <div class="a-item__body">
              <div class="a-item__title">${escapeHtml(title) || '(بدون اسم)'}</div>
              <div class="a-item__meta">${escapeHtml(meta)}</div>
            </div>
            <div class="a-item__actions">
              <button class="a-btn a-btn--sm" type="button" data-action="edit" data-index="${index}">تعديل</button>
              <button class="a-btn a-btn--sm a-btn--danger" type="button" data-action="del" data-index="${index}">حذف</button>
            </div>
          </div>`;
        })
        .join('')
    : `<div class="a-empty">لسه مفيش ${escapeHtml(label.title)} — اضغط «إضافة».</div>`;

  panel.innerHTML = `<div class="a-card">
    <div class="a-toolbar">
      <div>
        <h1>${escapeHtml(label.title)}</h1>
        <p class="a-sub">${escapeHtml(label.hint)}</p>
      </div>
      <div class="a-savebar">
        <button class="a-btn a-btn--sm a-btn--primary" type="button" data-action="add">+ إضافة ${escapeHtml(label.one)}</button>
      </div>
    </div>
    <div class="a-list">${rows}</div>
    <p class="a-hint">أي تعديل بيتحفظ على GitHub فورًا، والموقع بيتحدّث أوتوماتيك خلال دقيقة تقريبًا.</p>
  </div>`;
}

/* ---------- dashboard: profile ---------- */
function renderProfile(): void {
  const site = state.files[FILES.site].data as AnyRecord;
  const text = (key: string, label: string, ltr = false, type = 'text') => {
    const raw = getPath(site, key);
    const value = Array.isArray(raw) ? raw.join('\n\n') : (raw ?? '');
    const dir = ltr ? 'dir="ltr"' : '';
    if (type === 'textarea') {
      return `<label class="a-field"><span class="a-label">${label}</span><textarea class="a-textarea" name="${key}" ${dir}>${escapeHtml(value)}</textarea></label>`;
    }
    return `<label class="a-field"><span class="a-label">${label}</span><input class="a-input" name="${key}" value="${escapeHtml(
      value,
    )}" ${dir} /></label>`;
  };

  const socials = (site.socials as AnyRecord[])
    .map(
      (social) => `<label class="a-field">
        <span class="a-label">${escapeHtml(social.label)}</span>
        <input class="a-input" name="social.${escapeHtml(social.id)}" dir="ltr" value="${escapeHtml(social.url || '')}" />
      </label>`,
    )
    .join('');

  panel.innerHTML = `<form class="a-card" id="profileForm">
    <div class="a-toolbar">
      <div>
        <h1>الملف الشخصي</h1>
        <p class="a-sub">الاسم والوصف والإيميل وروابط السوشيال.</p>
      </div>
    </div>

    <div class="a-row2">
      ${text('name.ar', 'الاسم (عربي)')}
      ${text('name.en', 'الاسم (إنجليزي)', true)}
    </div>
    <div class="a-row2">
      ${text('role.ar', 'المسمى الوظيفي (عربي)')}
      ${text('role.en', 'المسمى الوظيفي (إنجليزي)', true)}
    </div>
    ${text('tagline.ar', 'الجملة التعريفية (عربي)')}
    ${text('tagline.en', 'الجملة التعريفية (إنجليزي)', true)}
    <div class="a-row2">
      ${text('availability.ar', 'حالة التوفر (عربي)')}
      ${text('availability.en', 'حالة التوفر (إنجليزي)', true)}
    </div>

    <h2 style="margin-top:22px">النبذة</h2>
    <p class="a-hint">سطر فاضي بين الفقرات = فقرة جديدة.</p>
    ${text('bio.ar', 'النبذة (عربي)', false, 'textarea')}
    ${text('bio.en', 'النبذة (إنجليزي)', true, 'textarea')}

    <h2 style="margin-top:22px">التواصل</h2>
    ${text('email', 'الإيميل', true)}
    ${text('formEndpoint', 'Formspree endpoint (اختياري)', true)}
    <p class="a-hint">لو حطيت إيميل بس، الفورم هيفتح برنامج الإيميل. لو حطيت Formspree، هيتبعت من غير ما يفتح حاجة.</p>

    <h2 style="margin-top:22px">السوشيال</h2>
    <p class="a-hint">سيب اللينك فاضي وهو مش هيظهر في الموقع.</p>
    ${socials}

    <div class="a-actions">
      <button class="a-btn a-btn--primary" type="submit">حفظ التعديلات</button>
    </div>
    <p class="a-status" id="profileStatus" role="status"></p>
  </form>`;

  const form = $('#profileForm') as HTMLFormElement;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#profileStatus');
    status.dataset.state = '';
    status.textContent = 'بيتحفظ...';

    const data = new FormData(form);
    for (const [key, raw] of data.entries()) {
      if (key.startsWith('social.')) continue;
      const value = String(raw);
      if (key.startsWith('bio.')) {
        setPath(
          site,
          key,
          value
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean),
        );
      } else {
        setPath(site, key, value.trim());
      }
    }

    for (const social of site.socials as AnyRecord[]) {
      const value = data.get(`social.${social.id}`);
      if (typeof value === 'string') social.url = value.trim();
    }

    try {
      await saveFile(FILES.site, 'content: update profile');
      status.dataset.state = 'ok';
      status.textContent = 'اتحفظ — الموقع هيتحدّث خلال دقيقة.';
      toast('اتحفظ بنجاح', 'ok');
    } catch (error) {
      status.dataset.state = 'err';
      status.textContent = error instanceof Error ? error.message : 'فشل الحفظ';
    }
  });
}

/* ---------- dashboard: raw json ---------- */
function renderJson(): void {
  const options = (Object.keys(FILES) as Array<keyof typeof FILES>)
    .map((key) => `<option value="${key}">${escapeHtml(FILES[key])}</option>`)
    .join('');

  panel.innerHTML = `<div class="a-card">
    <div class="a-toolbar">
      <div>
        <h1>تحرير JSON</h1>
        <p class="a-sub">تحكم كامل في أي ملف — للاستخدام المتقدم.</p>
      </div>
      <select class="a-select" id="jsonFile" style="max-width:280px">${options}</select>
    </div>
    <textarea class="a-textarea" id="jsonArea" spellcheck="false" dir="ltr"
      style="min-height:400px;font-family:'JetBrains Mono',monospace;font-size:0.8rem"></textarea>
    <div class="a-actions">
      <button class="a-btn a-btn--primary" type="button" data-action="json-save">حفظ</button>
      <button class="a-btn" type="button" data-action="json-reload">إعادة تحميل</button>
    </div>
  </div>`;

  const select = $('#jsonFile') as HTMLSelectElement;
  const area = $('#jsonArea') as HTMLTextAreaElement;

  const fill = async (key: keyof typeof FILES) => {
    area.value = 'بيتحمّل…';
    try {
      const file = await loadFile(key);
      area.value = JSON.stringify(file.data, null, 2);
    } catch (error) {
      area.value = '';
      toast(error instanceof Error ? error.message : 'فشل التحميل', 'err');
    }
  };

  select.value = state.tab === 'json' ? 'site' : 'programs';
  void fill(select.value as keyof typeof FILES);
  select.addEventListener('change', () => void fill(select.value as keyof typeof FILES));
}

/* ---------- editor dialog ---------- */
const dialog = $('#editorDialog') as HTMLDialogElement;
const editorForm = $('#editorForm') as HTMLFormElement;
const editorBody = $('#editorBody');
const editorTitle = $('#editorTitle');

function blankItem(kind: Kind): AnyRecord {
  const id = `item-${Date.now().toString(36)}`;
  if (kind === 'links') {
    return { id, title: { ar: '', en: '' }, desc: { ar: '', en: '' }, url: '', icon: 'link' };
  }
  return {
    id,
    name: { ar: '', en: '' },
    desc: { ar: '', en: '' },
    url: '',
    repo: '',
    year: String(new Date().getFullYear()),
    tags: [],
    image: '',
    demo: false,
  };
}

function fieldMarkup(field: ReturnType<typeof projectFields>[number], value: any): string {
  const dir = field.ltr ? 'dir="ltr"' : '';
  if (field.type === 'textarea') {
    return `<label class="a-field"><span class="a-label">${escapeHtml(field.label)}</span>
      <textarea class="a-textarea" name="${field.key}" ${dir}>${escapeHtml(value)}</textarea></label>`;
  }
  if (field.type === 'checkbox') {
    return `<label class="a-field" style="display:flex;gap:10px;align-items:center">
      <input type="checkbox" name="${field.key}" ${value ? 'checked' : ''} style="width:18px;height:18px" />
      <span style="font-size:0.86rem;color:var(--muted)">${escapeHtml(field.label)}</span></label>`;
  }
  if (field.type === 'select') {
    const options = (field.options || [])
      .map((option) => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`)
      .join('');
    return `<label class="a-field"><span class="a-label">${escapeHtml(field.label)}</span>
      <select class="a-select" name="${field.key}">${options}</select></label>`;
  }
  if (field.type === 'image') {
    const preview = value || '/favicon.svg';
    return `<div class="a-field">
      <span class="a-label">${escapeHtml(field.label)}</span>
      <div class="a-imgprev">
        <img data-preview src="${escapeHtml(preview)}" alt="" />
        <input class="a-input" name="${field.key}" dir="ltr" value="${escapeHtml(value)}" />
      </div>
      <input class="a-input" type="file" accept="image/*" data-image-file style="margin-top:8px" />
    </div>`;
  }
  return `<label class="a-field"><span class="a-label">${escapeHtml(field.label)}</span>
    <input class="a-input" name="${field.key}" value="${escapeHtml(value)}" ${dir} /></label>`;
}

function openEditor(kind: Kind, index: number | null): void {
  const path = FILES[kind];
  const list = state.files[path].data as AnyRecord[];
  const fields = kind === 'links' ? linkFields() : projectFields();
  const item = index === null ? blankItem(kind) : structuredClone(list[index]);

  state.editor = { kind, index };
  editorTitle.textContent = `${index === null ? 'إضافة' : 'تعديل'} ${KIND_LABEL[kind].one}`;
  editorBody.innerHTML = fields
    .map((field) => fieldMarkup(field as ReturnType<typeof projectFields>[number], getPath(item, field.key)))
    .join('');

  dialog.showModal();
}

editorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.editor) return;
  const { kind, index } = state.editor;
  const path = FILES[kind];
  const list = state.files[path].data as AnyRecord[];
  const fields = kind === 'links' ? linkFields() : projectFields();

  const data = new FormData(editorForm);
  const item: AnyRecord = index === null ? blankItem(kind) : structuredClone(list[index]);

  for (const field of fields) {
    const raw = data.get(field.key);
    if (field.type === 'checkbox') {
      setPath(item, field.key, raw === 'on');
    } else if (field.key === 'tags') {
      setPath(
        item,
        'tags',
        String(raw || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      );
    } else {
      setPath(item, field.key, String(raw ?? '').trim());
    }
  }

  const title = kind === 'links' ? item.title?.ar || item.title?.en : item.name?.ar || item.name?.en;
  if (!title) {
    toast('الاسم مطلوب', 'err');
    return;
  }
  if (index === null) {
    item.id = slugify(item.name?.en || item.title?.en || title) || item.id;
    const duplicate = list.some((entry) => entry.id === item.id);
    if (duplicate) item.id = `${item.id}-${Date.now().toString(36).slice(-3)}`;
  }

  if (index === null) list.push(item);
  else list[index] = item;

  dialog.close();
  state.editor = null;

  try {
    await saveFile(path);
    toast('اتحفظ — الموقع هيتحدّث خلال دقيقة', 'ok');
    renderList(kind);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'فشل الحفظ', 'err');
  }
});

$$('[data-close]').forEach((button) =>
  button.addEventListener('click', () => {
    dialog.close();
    state.editor = null;
  }),
);

editorBody.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  if (!input.matches('[data-image-file]')) return;
  const file = input.files?.[0];
  if (!file) return;
  toast('بيترفع...');
  try {
    const url = await uploadImage(file, state.editor?.kind || 'image');
    const field = editorBody.querySelector<HTMLInputElement>('[name="image"]');
    const preview = editorBody.querySelector<HTMLImageElement>('[data-preview]');
    if (field) field.value = url;
    if (preview) preview.src = url;
    toast('الصورة اترفعت', 'ok');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'فشل الرفع', 'err');
  }
});

/* ---------- panel delegation ---------- */
panel.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const index = Number(target.dataset.index ?? -1);

  if (action === 'retry') {
    void openTab(state.tab);
    return;
  }

  if (state.tab === 'json') {
    const select = $('#jsonFile') as HTMLSelectElement | null;
    const area = $('#jsonArea') as HTMLTextAreaElement | null;
    if (!select || !area) return;

    if (action === 'json-reload') {
      const key = select.value as keyof typeof FILES;
      delete state.files[FILES[key]];
      try {
        const file = await loadFile(key);
        area.value = JSON.stringify(file.data, null, 2);
        toast('اتحدّث', 'ok');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'فشل التحميل', 'err');
      }
      return;
    }

    if (action === 'json-save') {
      const key = select.value as keyof typeof FILES;
      const path = FILES[key];
      let parsed: any;
      try {
        parsed = JSON.parse(area.value);
      } catch {
        toast('JSON غير صالح — راجع الأقواس والفاصلة.', 'err');
        return;
      }
      try {
        await loadFile(key);
        state.files[path].data = parsed;
        await saveFile(path);
        toast('اتحفظ — الموقع هيتحدّث خلال دقيقة', 'ok');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'فشل الحفظ', 'err');
      }
      return;
    }
  }

  if (action === 'add') {
    openEditor(state.tab as Kind, null);
    return;
  }

  if (action === 'edit') {
    openEditor(state.tab as Kind, index);
    return;
  }

  if (action === 'del') {
    const kind = state.tab as Kind;
    const path = FILES[kind];
    const list = state.files[path].data as AnyRecord[];
    const title = kind === 'links' ? list[index]?.title?.ar : list[index]?.name?.ar;
    if (!confirm(`هتحذف «${title || 'العنصر'}»؟`)) return;
    list.splice(index, 1);
    try {
      await saveFile(path);
      toast('اتحذف', 'ok');
      renderList(kind);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'فشل الحذف', 'err');
    }
  }
});

/* ---------- boot ---------- */
(function boot() {
  if (!window.isSecureContext || !crypto.subtle) {
    document.body.innerHTML =
      '<div class="a-wrap"><div class="a-card"><h1>اللوحة محتاجة HTTPS</h1><p class="a-sub">افتح اللوحة من الموقع المنشور على GitHub Pages، أو من localhost.</p></div></div>';
    return;
  }

  const config = loadConfig();
  if (!config) {
    show('setup');
    return;
  }

  state.config = config;
  state.branch = config.branch || 'main';
  const username = loginForm.querySelector<HTMLInputElement>('[name="username"]');
  if (username) username.value = config.username;
  show('login');
})();
