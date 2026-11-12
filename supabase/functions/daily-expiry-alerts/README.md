# دالة التنبيهات اليومية عبر البريد الإلكتروني (Supabase Edge Function: daily-expiry-alerts)

دالة سحابية (Edge Function) تُنفذ يومياً لفحص صلاحية الأرقام المميزة (البطاقات المدنية) وجوازات السفر من خلال العرض `records_with_status`، وإرسال بريد إلكتروني عربي منظم ومجدول إلى مسؤولي النظام (`role = 'admin'`).

---

## 1. محتويات الدالة وسير العمل

1. **الاستعلام عن اسم الشركة**: من جدول `settings`.
2. **فحص الوثائق المستحقة**:
   * الوثائق المنتهية (`unique_number_status = 'expired'` أو `passport_status = 'expired'`).
   * الوثائق التي قاربت على الانتهاء (`unique_number_status = 'expiring_soon'` أو `passport_status = 'expiring_soon'`).
3. **تحديد المسؤولين المستلمين**:
   * البحث عن المستخدمين بصفة مدير (`role = 'admin'`) في جدول `profiles` وجلب عناوين بريدهم الإلكتروني.
4. **توليد قالب بريد إلكتروني احترافي (RTL)**:
   * تصميم متوافق مع كافة برامج البريد الإلكتروني (Outlook, Gmail, Apple Mail).
   * جداول واضحة بالأسماء والأرقام وتواريخ الانتهاء والأيام المتبقية بتوقيت الكويت (`Asia/Kuwait`).
   * زر مباشر لفتح لوحة التحكم ومتابعة التجديد.
5. **الإرسال والتسجيل**:
   * إرسال البريد عبر خدمة Resend (أو مزود البريد المعتمد).
   * تسجيل العملية والنتائج في جدول `notifications_log`.

---

## 2. خطوات النشر والإعداد في Supabase

### الخطوة الأولى: رفع الدالة السحابية (Deploy)
باستخدام أداة Supabase CLI في سطر الأوامر:

```bash
# تسجيل الدخول إلى مشروع Supabase الخاص بك
supabase login

# ربط المشروع
supabase link --project-ref your-project-id

# نشر الدالة السحابية
supabase functions deploy daily-expiry-alerts --no-verify-jwt
```

---

### الخطوة الثانية: ضبط المتغيرات السرية (Secrets)

قم بضبط مفتاح خدمة البريد Resend (أو يمكنك الحصول على مفتاح تجريبي مجاني من [resend.com](https://resend.com)):

```bash
supabase secrets set RESEND_API_KEY="re_xxxxxxxxxxxxxx"
supabase secrets set ALERT_EMAIL_FROM="برنامج التنبيه <alerts@yourcompany.com>"
supabase secrets set APP_URL="https://your-app-url.run.app"
```

*(ملاحظة: المتغيرات `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` يتم حقنها تلقائياً من قبل بيئة تشغيل Supabase).*

---

### الخطوة الثالثة: الجدولة التلقائية اليومية عبر `pg_cron`

لتشغيل الدالة تلقائياً كل صباح في تمام الساعة **8:00 صباحاً بتوقيت الكويت** (الساعة 05:00 بتوقيت UTC)، افتح **SQL Editor** في لوحة تحكم Supabase ونفذ الأمر التالي:

```sql
-- 1. تفعيل إضافات الجدولة والشبكة إن لم تكن مفعلة
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. إنشاء مهمة مجدولة يومية
select cron.schedule(
  'send-daily-expiry-alerts-job',
  '0 5 * * *', -- الساعة 05:00 UTC (تعادل 08:00 صباحاً بتوقيت الكويت)
  $$
  select
    net.http_post(
      url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1/daily-expiry-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

أو يمكنك استخدام رابط الدالة المباشر مع مفتاح `anon` أو `service_role` كالتالي:

```sql
select cron.schedule(
  'send-daily-expiry-alerts-job',
  '0 5 * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/daily-expiry-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_OR_ANON_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

---

## 3. الاختبار اليدوي وتجربة الإرسال

يمكنك اختبار الدالة فوراً عبر سطر الأوامر:

```bash
# تجربة المعاينة (Dry Run) بدون إرسال فعلي:
curl -X POST 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/daily-expiry-alerts' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"dry_run": true}'

# تجربة إرسال بريد اختباري إلى بريدك:
curl -X POST 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/daily-expiry-alerts' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"test_email": "your_email@domain.com"}'
```

كما يمكن للمسؤولين تشغيل الفحص التجريبي ومراجعة سجل الإشعارات مباشرة من لوحة تحكم تطبيق الويب!
