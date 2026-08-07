# تفعيل التسجيل والدخول بواسطة Gmail / Google

## الحالة داخل المصدر

تم تجهيز التطبيق ليستخدم `Supabase Auth` وGoogle OAuth، ويشمل:

- زر دخول متجاوب باستخدام Google.
- إعادة المستخدم إلى رابط GitHub Pages الصحيح بعد المصادقة.
- حفظ الجلسة وتحديثها تلقائيًا.
- قراءة الاسم والصورة والبريد من حساب Google.
- تسجيل الخروج.
- إنشاء سجل في `public.profiles` تلقائيًا من خلال migration آمنة.
- إبقاء دور المستخدم `member` وعدم أخذ الأدوار من `user_metadata`.
- فصل حساب الدخول عن سجل الشخص داخل شجرة المنطقة.

## مشروع Supabase المرتبط

- Project URL: `https://rtmdaalabudycimnnena.supabase.co`
- Project Ref: `rtmdaalabudycimnnena`
- المفتاح المستخدم في المتصفح هو مفتاح `publishable` فقط.

المفتاح القابل للنشر يظهر في المتصفح بطبيعته؛ الحماية الحقيقية تعتمد على RLS. يمنع نهائيًا إضافة `service_role` أو Google Client Secret إلى GitHub.

يمكن وضع القيم كـGitHub Variables من:

`Settings → Secrets and variables → Actions → Variables`

- `VITE_SUPABASE_URL`: `https://rtmdaalabudycimnnena.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: المفتاح القابل للنشر الخاص بالمشروع.

المصدر يحتوي أيضًا على قيم عامة احتياطية حتى لا يتعطل النشر عند عدم إضافة Variables.

## إعداد Google Cloud

1. افتح Google Auth Platform وأنشئ OAuth Client جديدًا.
2. اختر نوع التطبيق `Web application`.
3. في Authorized JavaScript origins أضف:
   - `https://aymanamin.github.io`
   - `http://localhost:5173` للتطوير المحلي فقط.
4. في Authorized redirect URIs أضف:
   - `https://rtmdaalabudycimnnena.supabase.co/auth/v1/callback`
5. فعّل scopes الأساسية فقط:
   - `openid`
   - `email`
   - `profile`
6. احفظ `Client ID` و`Client Secret`.

## إعداد Supabase

من مشروع Family:

1. افتح `Authentication → Providers → Google`.
2. فعّل Google.
3. أدخل Google Client ID وGoogle Client Secret داخل Supabase فقط.
4. لا تفعل Skip nonce check لتطبيق الويب.
5. من `Authentication → URL Configuration` عيّن:
   - Site URL: `https://aymanamin.github.io/Family/`
   - Redirect URL: `https://aymanamin.github.io/Family/`
   - Redirect URL للتطوير: `http://localhost:5173/**`
6. نفّذ migration الموجودة في:
   - `supabase/migrations/202608070001_create_profiles.sql`

## التحقق

بعد الإعداد:

1. افتح `https://rtmdaalabudycimnnena.supabase.co/auth/v1/settings` مع مفتاح publishable في ترويسة `apikey`.
2. يجب أن تكون قيمة Google تحت `external` مساوية لـ`true`.
3. افتح الموقع المنشور واضغط «المتابعة باستخدام Google».
4. بعد الرجوع يجب أن يظهر اسم المستخدم وصورته.
5. تحقق من إنشاء صف مطابق في `public.profiles`.
6. سجل الخروج ثم الدخول مرة أخرى للتأكد من استمرار الجلسة بصورة صحيحة.

## نموذج الصلاحيات

تسجيل Google يثبت هوية الحساب فقط، ولا يثبت أن المستخدم يمثل شخصًا بعينه داخل شجرة المنطقة. بعد الدخول يقدم المستخدم طلب ربط حسابه بسجل شخص، ولا يصبح عضوًا موثقًا إلا بعد موافقة الإدارة.
