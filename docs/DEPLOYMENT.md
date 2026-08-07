# النشر المباشر من GitHub

## الاستضافة المعتمدة

- الواجهة: GitHub Pages.
- البناء والنشر: GitHub Actions.
- البيانات والمصادقة والملفات: Supabase.
- رابط الإنتاج الأساسي: `https://aymanamin.github.io/Family/`.

## إعداد المستودع لمرة واحدة

1. افتح `Settings → Pages`.
2. في `Build and deployment` اختر `Source: GitHub Actions`.
3. افتح `Settings → Secrets and variables → Actions → Variables`.
4. أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`.
5. ادفع أي تعديل إلى الفرع `main` أو شغّل workflow يدويًا.

## آلية النشر

ملف `.github/workflows/deploy-pages.yml` يقوم تلقائيًا بالآتي:

1. تنزيل المصدر.
2. إعداد Node.js.
3. تثبيت الإصدارات المحددة في `package.json`.
4. فحص TypeScript.
5. بناء نسخة الإنتاج بمسار `/Family/`.
6. رفع مجلد `dist` كـPages artifact.
7. نشر النسخة على GitHub Pages.

لا يعتمد النشر على جهاز المطور ولا يحتاج رفع ملفات `dist` يدويًا.

## متغيرات الواجهة

القيمتان التاليتان فقط مسموح بوصولهما إلى المتصفح:

- Supabase Project URL.
- Supabase publishable key.

القيم التالية ممنوعة في الواجهة أو GitHub العام:

- Supabase `service_role`.
- كلمة مرور قاعدة البيانات.
- Google Client Secret.
- أسرار البريد أو WhatsApp أو أي مزود خارجي.

## النطاق المخصص مستقبلًا

عند إضافة نطاق مخصص:

1. يضاف ملف `CNAME` في `public`.
2. يعدل `base` في `vite.config.ts` ليكون `/`.
3. تعدل Site URL وRedirect URLs في Supabase.
4. يعدل Authorized JavaScript origin في Google Cloud.

لا يغير هذا تصميم قاعدة البيانات أو منطق المصادقة.
