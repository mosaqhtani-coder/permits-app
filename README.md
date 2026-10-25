# تطبيق تصاريح العمل (PWA مستقل)
تطبيق جوال مستقل يكلّم Apps Script مباشرة عبر بوابة JSON (Api.gs) - نفس الحسابات والبيانات والدرايف مع الموقع.
الملفات: index.html, app.js, styles.css, config.js, sw.js, manifest.webmanifest, icons/ (4 صور), .nojekyll
التشغيل: ارفع كل المحتويات لجذر مستودع GitHub Pages. أول فتح يطلب رابط /exec مرة وحدة (أو ضعه بـ config.js).
الاختبار: python3 tests/e2e.py (Playwright) و node tests/api_test.js
