# FZA3HA — الموقع الشخصي

موقع شخصي لـ **سيف حسن أحمد (FZA3HA)** — مطور بايثون.
صفحة واحدة، عربي (افتراضي) + إنجليزي، مشهد 3D خفيف، ولوحة تحكم خاصة لإضافة وتعديل كل حاجة من المتصفح.

- **Stack:** Astro + Three.js + CSS مخصص (بدون أي UI framework).
- **الاستضافة:** GitHub Pages (مجاني).
- **المحتوى:** ملفات JSON بسيطة في `src/data/`.
- **اللوحة:** `/admin/` — يوزر + باسورد + GitHub Token.

---

## 1) تشغيل محلي

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # يبني الموقع في dist/
npm run preview  # يعاين نسخة الـ build
```

> `npm run build` بيشغّل `scripts/fetch-thumbs.mjs` الأول: بيجيب صورة/سكرين شوت أوتوماتيك لكل موقع وبرنامج له رابط. لو النت واقف، البيلد بيكمّل عادي بالصور البديلة.

---

## 2) النشر على GitHub Pages

1. اعمل ريبو باسم **`FZA3HA.github.io`** (لازم يكون بنفس اسم الحساب عشان يبقى على الدومين الأساسي).
2. ارفع الملفات:

   ```bash
   git init
   git add .
   git commit -m "init: fza3ha site"
   git branch -M main
   git remote add origin https://github.com/FZA3HA/FZA3HA.github.io.git
   git push -u origin main
   ```

3. في الريبو: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
4. أي push على `main` بيبني وينشر أوتوماتيك (`.github/workflows/deploy.yml`).
5. الموقع: `https://fza3ha.github.io`

---

## 3) لوحة التحكم `/admin/`

اللوحة بتشتغل من المتصفح مباشرة وتعدّل ملفات الريبو عن طريق GitHub API.

### أول مرة (مرة واحدة بس)

1. افتح `https://fza3ha.github.io/admin/`
2. اعمل **Fine-grained token** من
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Repository access: **Only select repositories** → `FZA3HA.github.io`
   - Permissions → **Contents: Read and write**
3. في اللوحة اكتب: اسم المستخدم، كلمة المرور (٨ حروف على الأقل)، والتوكن.
4. خلاص — كل مرة بعدها بتدخل باليوزر والباسورد بس.

### الأمان — إزاي بيشتغل

- **التوكن مش بيتخزن في الريبو ولا بيتبعت لأي سيرفر.** بيتشفّر (PBKDF2 + AES-GCM) ويتخزن في `localStorage` على جهازك بس.
- اللي معاه كلمة المرور بس **مش قادر يعمل حاجة** من غير التوكن الموجود على جهازك.
- أي حد تاني يفتح `/admin/` هيلاقي شاشة دخول فاضية — مفيش أي صلاحية في الصفحة نفسها.
- لو مسحت بيانات المتصفح أو غيّرت جهاز: تدخل التوكن من جديد (نفس الخطوة ٢).
- التوكن يفضل في بالك: لو اتلغى من GitHub، اللوحة هتقولك.

### اللي تقدر تعمله من اللوحة

| تاب | بتعمل إيه |
| --- | --- |
| البرامج | إضافة/تعديل/حذف برامج، رفع صورة، وسوم، سنة، روابط |
| المواقع | نفس الحاجة للمواقع |
| اللينكات | كروت اللينكات (الاسم، الوصف، الرابط، الأيقونة) |
| الملف الشخصي | الاسم، المسمى، الجملة التعريفية، النبذة، الإيميل، السوشيال |
| JSON | تحرير أي ملف JSON مباشرة (تحكم كامل) |

كل حفظ = commit على GitHub → الموقع يتحدّث خلال دقيقة تقريبًا.

---

## 4) إضافة حاجة من غير اللوحة

كل حاجة في `src/data/`:

```jsonc
// src/data/programs.json  (نفس الشكل لـ sites.json)
{
  "id": "my-app",              // لازم يكون فريد — بيستخدم لاسم صورة الغلاف
  "name": { "ar": "اسم البرنامج", "en": "App name" },
  "desc": { "ar": "وصف سطرين", "en": "Two lines" },
  "url": "https://...",        // رابط التحميل/الموقع (فاضي = "قريبًا")
  "repo": "https://github.com/...",  // اختياري
  "year": "2026",
  "tags": ["Python", "CLI"],
  "image": "",                 // فاضي = صورة أوتوماتيك
  "demo": false                // true = تظهر شارة "نموذج"
}
```

- **اللينكات** في `src/data/links.json` (نفس الفكرة: `title`, `desc`, `url`, `icon`).
- **الأيقونات المتاحة:** `link, github, linkedin, x, youtube, telegram, whatsapp, mail, globe, code, external, download, star, user`.
- **الملف الشخصي** في `src/data/site.json` (الاسم، النبذة، المهارات، السوشيال…).

### الصور الأوتوماتيك

- البيلد بيحاول يجيب `og:image` من الصفحة، ولو مش موجود بياخد سكرين شوت، ويحفظها في `public/thumbs/<id>.jpg`.
- عايز صورة مختلفة؟ حط مسارها في `image` (مثال: `/uploads/my-app.webp`) — بتاخد الأولوية.
- رفع صورة من اللوحة بيحطها في `public/uploads/` ويحوّلها WebP ويصغّرها تلقائيًا.

---

## 5) الفورم

- **الأسهل:** حط إيميلك في `site.json` → `email`. الفورم هيفتح برنامج الإيميل.
- **الاحترافي:** اعمل فورم مجاني على [Formspree](https://formspree.io) وحط الرابط في `formEndpoint` → الرسائل توصل من غير ما تفتح حاجة.

---

## 6) التخصيص

- **الألوان والخطوط:** `src/styles/global.css` — أول بلوك `:root`.
  الموقع حاليًا أبيض/أسود/فضي (كروم). لتغيير الأكسنت غيّر `--chrome` أو أضف لون واحد في مكان واحد.
- **اللغتين:** كل نص في الموقع إما في `src/lib/i18n.ts` (نصوص الواجهة) أو في `src/data/*.json` بصيغة `{ "ar": "...", "en": "..." }`.
- **الـ3D:** `src/scripts/scene.ts` — عدد الجزيئات، الدقة، وكل حاجة متعلقة بالأداء. المشهد بيتحمّل بعد ما الصفحة تخلص (lazy) وبيتوقف لما يكون برّه الشاشة أو التاب مخفي.

---

## 7) قبل ما تنشر — شيك ليست

- [x] العناصر التجريبية اتشالت — `programs.json` فاضي لحد ما تضيف شغلك.
- [x] الإيميل متسجّل: `fza3ha10@gmail.com` (الفورم بيفتح برنامج الإيميل).
- [ ] ضيف برامجك ومواقعك من `/admin/` أو من ملفات `src/data/`.
- [ ] ضيف لينكات السوشيال (LinkedIn / X / YouTube / Telegram / WhatsApp).
- [ ] راجع النبذة والمهارات.
- [ ] (اختياري) دومين مخصص: Settings → Pages → Custom domain.

---

## 8) شكل المشروع

```
public/            الصور والأيقونات و robots.txt
scripts/           أدوات البيلد (صور أوتوماتيك / تحسين الصور)
src/
  components/      أقسام الصفحة
  data/            ← المحتوى كله هنا
  layouts/         الهيكل والـ SEO
  lib/             أنواع + نصوص اللغتين
  pages/           / (عربي) — /en/ — /admin/
  scripts/         main.ts (تفاعلات) — scene.ts (3D) — admin.ts (اللوحة)
  styles/          global.css — admin.css
```
