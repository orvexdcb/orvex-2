# تهيئة مركز تحديثات ORVEX — قبل تفعيل التوزيع

هذا الدليل يكمل إعدادات الإصدار الموجودة في الحزمة. **لا يعني رفع هذه الملفات أن Vercel أو Supabase قد تم نشرهما**؛ النشر الفعلي يتطلب صلاحيات حساباتك ومراجعة المشروع المستهدف.

## 1) ما الذي توفره الحزمة حالياً؟

- واجهة مركز التحديثات في `update-center.js`.
- Edge Function لإدارة الإصدارات: `orvex-release-center`.
- Edge Function لمراقبة أخطاء تحميل الملفات: `orvex-release-monitor`.
- جداول وسجل تدقيق في `supabase/migrations/20261111180000_orvex_release_center.sql`.
- وسيط Vercel محمي بتذكرة قصيرة العمر في `api/release-ticket.js` و`api/release-proxy.js`.
- Workflow لتجهيز إصدار Vercel دون تحويل نطاق الإنتاج: `.github/workflows/orvex-stage-release.yml`.
- Workflow محمي لنشر Edge Functions: `.github/workflows/orvex-deploy-supabase-functions.yml`.

## 2) إعداد GitHub Environments

أنشئ Environment باسم `orvex-supabase-production` وفعّل Required reviewers قبل استخدام Workflow نشر Supabase.

أضف إلى Environment `orvex-supabase-production`:

**Secrets**
- `SUPABASE_ACCESS_TOKEN`: رمز وصول Supabase CLI.
- `ORVEX_RELEASE_TICKET_SECRET`: سر عشوائي قوي لا يقل عن 32 حرفاً. استخدم القيمة نفسها في Supabase Functions وVercel، ولا تضعها في ملفات المشروع أو المحادثات.

**Variables**
- `SUPABASE_PROJECT_REF`: معرّف مشروع Supabase الصحيح.
- `SUPABASE_CLI_VERSION`: رقم إصدار CLI ثابت ومراجع، وليس `latest`.

أنشئ Environment باسم `orvex-release-staging` وأضف:

**Secret**
- `VERCEL_TOKEN`: رمز Vercel محدود الصلاحيات اللازمة للنشر.

**Variables**
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_CLI_VERSION`: إصدار ثابت ومراجع من Vercel CLI.

## 3) إعداد Vercel Environment Variables

في مشروع Vercel الصحيح، أضف المتغيرات التالية إلى Production (وأضف Preview فقط إذا كنت تختبر بيئة Preview منفصلة):

- `SUPABASE_URL`: عنوان مشروع Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: المفتاح العام الحالي للمشروع. يمكن استخدام `SUPABASE_ANON_KEY` للتوافق القديم إذا كان المشروع لا يزال يعتمد عليه.
- `ORVEX_RELEASE_TICKET_SECRET`: نفس السر الذي وضعته في GitHub وSupabase، بطول 32 حرفاً على الأقل.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: اختياري فقط إذا كان الوصول إلى نشرات Vercel محمياً بـ Deployment Protection؛ استخدم سر تجاوز الحماية الخاص بالمشروع.

لا تضع `SUPABASE_SERVICE_ROLE_KEY` في Vercel Frontend أو أي متغير يبدأ بـ `NEXT_PUBLIC_`. لا يحتاج وسيط Vercel في هذه الحزمة إلى Service Role Key.

## 4) قاعدة البيانات — خطوة يدوية إلزامية قبل التفعيل

ملف مركز التحديثات يضيف الجداول:
- `orvex_releases`
- `orvex_release_targets`
- `orvex_release_events`

ويفعّل RLS ويمنع الوصول المباشر من `anon` و`authenticated`؛ إدارة هذه الجداول تتم من Edge Function باستخدام صلاحيات الخادم.

**تنبيه ترحيلات مهم:** في الحزمة الحالية يوجد ترتيب زمني يستحق المعالجة قبل تطبيق كل migrations على قاعدة جديدة:
`20261107181200_feedback_requests_policy_and_index_tuning.sql` يستخدم `feedback_requests` قبل أن ينشئه الملف `20261107190000_feedback_requests_and_fk_index.sql`.
إذا كانت ترحيلات هذين الملفين قد طُبقت مسبقاً على قاعدة ORVEX الحالية فلا تعِد ترتيب أو إعادة تشغيل سجلها. إذا كانت قاعدة جديدة، أصلح ترتيب/محتوى الترحيلات بعد مقارنة `supabase migration list` مع القاعدة البعيدة. لا تشغّل `supabase db reset` على قاعدة الإنتاج.

بعد مراجعة سجل الترحيلات وحل الترتيب، طبّق migration مركز التحديثات من خلال مسار ترحيلات معتمد، ثم تحقق من وجود الجداول الثلاثة وسياسات RLS. لا يكفي وجود ملف SQL في المستودع.

## 5) نشر Edge Functions

بعد ضبط Environment وSecrets:
1. راجع المشروع المستهدف ومعرّف `SUPABASE_PROJECT_REF`.
2. شغّل GitHub Actions → `ORVEX — Deploy release Edge Functions (protected)` بموافقة المراجع.
3. الـ Workflow يربط المشروع المحدد، يضع `ORVEX_RELEASE_ROUTING_ENABLED=false`، ثم ينشر الدالتين.
4. تأكد من نجاح النشر وظهور الدالتين في Supabase Dashboard.

يظل التوزيع مغلقاً عمداً حتى بعد نشر الدوال.

## 6) إعداد Vercel وتجهيز إصدار

1. تأكد أن مستودع GitHub مربوط بمشروع Vercel الصحيح وأن Root Directory هو مجلد التطبيق.
2. تأكد من وجود مسارات API التالية في النشر:
   - `/api/release-routing-health`
   - `/api/release-ticket`
   - `/api/release-proxy`
3. شغّل Workflow `ORVEX — Stage immutable release` بإصدار SemVer مثل `1.2.3`.
4. لا يحوّل هذا الـ Workflow النطاق الرئيسي إلى الإصدار الجديد؛ ينشئ Deployment إنتاجياً مرحلياً دون تعيين النطاق.
5. اختبر رابط الـ Deployment المرحلي، ثم سجّل في مركز ORVEX رابط الـ Deployment وبصمة SHA-256 الظاهرة في Workflow Summary عبر زر «تسجيل ملف الإصدار».
6. ابدأ الاختبار، تحقق من الحزمة والـ manifest، ثم اعتمد الإصدار.

## 7) تفعيل التوزيع — لا تفعل قبل اجتياز جميع الاختبارات

بعد التحقق من الجداول، الدالتين، متغيرات Vercel، شهادة صحة مسار Vercel، وصحة تحميل ملفات الإصدار:

- غيّر `ORVEX_RELEASE_ROUTING_ENABLED` في Supabase إلى `true` فقط بعد اعتماد مسؤول النظام.
- أعد نشر/تحقق من حالة الإعدادات حسب آلية Supabase؛ أسرار Edge Functions الجديدة تُقرأ من البيئة.
- اختبر بحساب تجريبي لمحل واحد فقط، ثم اختبر حساب المؤسس، وتأكد أن كل محل لا يرى إلا الإصدارات الموجهة إليه.
- لا تنشر إلى جميع المحلات قبل نجاح اختبار التنزيل والتراجع.

## 8) شروط النجاح

لا تعتبر الزر عاملاً لمجرد ظهور الواجهة. النجاح يتطلب:
- إنشاء إصدار في قاعدة البيانات.
- إنشاء Deployment مرحلي يحتوي `orvex-release.zip` و`orvex-release.json`.
- التحقق من SHA-256 والنسخة.
- إصدار تذكرة قصيرة العمر لمستخدم مصادق عليه.
- نجاح وسيط Vercel في تقديم الملفات من نفس أصل النشر.
- ظهور الإصدار للمحل المستهدف فقط بعد النشر الصريح.
- نجاح rollback واختبار العزل عند فشل التحميل.

## 9) حدود ما تم إنجازه هنا

تم تجهيز ملفات الإرشاد وWorkflow نشر الدوال، لكن لم يتم الدخول إلى حساب GitHub أو Vercel أو Supabase، ولم يتم تطبيق SQL أو تعيين أسرار أو نشر أي شيء عن بُعد. يلزم تنفيذ الخطوات أعلاه من الحسابات المرتبطة، مع إبقاء التوزيع معطلاً حتى اكتمال التحقق.
