/* تطبيق تصاريح العمل (PWA مستقل). يكلّم بوابة JSON (Api.gs) على نفس Apps Script، فالبيانات والحسابات مشتركة مع الموقع. */
(function () {
  'use strict';

  var APP_VERSION = '1.0';
  var root = document.getElementById('root');

  // ======================= أدوات عامة =======================
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function ltr(s) { var b = document.createElement('bdi'); b.setAttribute('dir', 'ltr'); b.textContent = s === null || s === undefined ? '' : String(s); return b; }

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var ICONS = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    site: '<path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3z"/><path d="M8.5 13l2.5 2.5L16 10"/>',
    photos: '<path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.8"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    back: '<path d="M9 5l7 7-7 7"/>',
    next: '<path d="M15 5l-7 7 7 7"/>',
    open: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M5 12h14"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  var toastTimer = null;
  function toast(text) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = h('div', { class: 'toast', text: text });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https:\/\/(drive|docs)\.google\.com\//i.test(u) ? u : '';
  }
  function extractUrls(s) { return (String(s || '').match(/https?:\/\/[^\s,،]+/g) || []).map(safeUrl).filter(Boolean); }

  var MONTHS = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // ======================= الاتصال بالخادم =======================
  var S = { user: null, token: lsGet('ptw_token') };

  function apiBase() {
    var cfg = (window.PTW_CONFIG && window.PTW_CONFIG.API_URL) || '';
    return String(cfg || lsGet('ptw_api_url') || '').trim();
  }
  var URL_RE = /^https:\/\/script\.google\.com\/(a\/(macros\/)?[^\/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  function validApiUrl(u) { return URL_RE.test(String(u || '').trim()); }

  function rpc(fn, args, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 90000) : null;
    return fetch(apiBase() + '?api=1', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [] }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.text(); }).then(function (txt) {
      try { return JSON.parse(txt); } catch (e) {
        return { ok: false, code: 'BAD', message: 'رد غير مفهوم من الخادم. تأكد إن نسخة Apps Script المنشورة v2.39 أو أحدث.' };
      }
    }).catch(function (e) {
      return { ok: false, code: 'NET', message: (e && e.name === 'AbortError') ? 'انتهت مهلة الاتصال. حاول مرة ثانية.' : 'تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة ثانية.' };
    }).then(function (res) { if (timer) clearTimeout(timer); return res; });
  }

  /** نداء دالة محمية: التوكن يروح كأول معامل. انتهاء الجلسة يرجّع لشاشة الدخول */
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return rpc(fn, [S.token].concat(args), fn.indexOf('upload') === 0 ? 180000 : 90000).then(function (res) {
      if (res && res.ok === false && res.code === 'AUTH') { sessionLost('انتهت جلستك، سجّل دخولك من جديد.'); }
      return res;
    });
  }

  function sessionLost(msg) {
    S.token = ''; S.user = null; lsDel('ptw_token'); lsDel('ptw_user');
    renderAuth(msg || '');
  }

  // ======================= الصور والملفات =======================
  var MAX_FILE = 20 * 1024 * 1024;
  function isHeic(f) { var t = (f.type || '').toLowerCase(); return t === 'image/heic' || t === 'image/heif' || /\.(heic|heif)$/i.test(f.name || ''); }
  function isImage(f) { return /^image\//i.test(f.type || '') || isHeic(f); }

  var heicPromise = null;
  function loadHeic() {
    if (window.heic2any) return Promise.resolve();
    if (heicPromise) return heicPromise;
    heicPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload = res; s.onerror = function () { heicPromise = null; rej(new Error('تعذر تحميل محوّل صور HEIC.')); };
      document.head.appendChild(s);
    });
    return heicPromise;
  }
  function readB64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('تعذر قراءة الملف.')); };
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.readAsDataURL(blob);
    });
  }
  function loadImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة. جرّب JPG أو PNG.')); };
      img.src = url;
    });
  }
  function compress(file) {
    var prep = Promise.resolve(file);
    if (isHeic(file)) {
      prep = loadHeic().then(function () { return window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }); })
        .then(function (o) { return Array.isArray(o) ? o[0] : o; })
        .catch(function () { throw new Error('تعذر تحويل صورة HEIC. جرّب تحفظها JPG من إعدادات الكاميرا.'); });
    }
    return prep.then(function (f) {
      var bmpP = (window.createImageBitmap) ? createImageBitmap(f, { imageOrientation: 'from-image' }).catch(function () { return null; }) : Promise.resolve(null);
      return bmpP.then(function (bmp) {
        return bmp ? bmp : loadImg(f);
      });
    }).then(function (src) {
      var w = src.width || src.naturalWidth, hh = src.height || src.naturalHeight, max = 1600;
      if (w > max || hh > max) { if (w > hh) { hh = Math.round(hh * max / w); w = max; } else { w = Math.round(w * max / hh); hh = max; } }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(src, 0, 0, w, hh);
      if (src.close) { try { src.close(); } catch (e) {} }
      return cv.toDataURL('image/jpeg', 0.72).split(',')[1];
    });
  }
  /** ملف -> {data, mime, name}. الصور تُضغط، غيرها (PDF/فيديو) يُرفع كما هو */
  function filePayload(file) {
    if (file.size > MAX_FILE) return Promise.reject(new Error('حجم الملف "' + file.name + '" كبير جداً (أقصى 20 ميجا).'));
    if (isImage(file)) return compress(file).then(function (b64) { return { data: b64, mime: 'image/jpeg', name: file.name }; });
    return readB64(file).then(function (b64) { return { data: b64, mime: file.type || 'application/octet-stream', name: file.name }; });
  }

  // ======================= الهيكل العام =======================
  var NAV = [
    { key: 'home', label: 'الرئيسية', icon: 'home', perm: 'any' },
    { key: 'site', label: 'تسجيل', icon: 'site', perm: 'site' },
    { key: 'photos', label: 'الصور', icon: 'photos', perm: 'site' },
    { key: 'me', label: 'صفحتي', icon: 'me', perm: 'mypage' }
  ];
  function has(p) { return p === 'any' || !!(S.user && S.user.perms && S.user.perms.indexOf(p) > -1); }

  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });

  function shell(active, title, content) {
    clear(root);
    var top = h('div', { class: 'topbar' },
      h('h1', { text: title }),
      h('button', { class: 'icon-btn', 'aria-label': 'القائمة', onclick: openMenu }, icon('menu')));
    var nav = h('nav', { class: 'nav' }, h('div', { class: 'nav-in' }, NAV.filter(function (n) { return has(n.perm); }).map(function (n) {
      return h('a', { href: '#/' + n.key, class: n.key === active ? 'on' : '', onclick: function () { if (location.hash === '#/' + n.key) route(); } }, icon(n.icon), h('span', { text: n.label }));
    })));
    root.appendChild(top);
    if (!navigator.onLine) root.appendChild(h('div', { class: 'banner', text: 'ما فيه اتصال بالإنترنت' }));
    root.appendChild(h('main', { class: 'main' }, content));
    root.appendChild(nav);
    window.scrollTo(0, 0);
  }

  function openSheet(titleText, items) {
    var bg = h('div', { class: 'sheet-bg', onclick: function (e) { if (e.target === bg) bg.remove(); } });
    var sheet = h('div', { class: 'sheet' }, h('h3', { text: titleText }));
    items.forEach(function (it) {
      if (it.node) { sheet.appendChild(it.node); return; }
      sheet.appendChild(h('button', { class: 'item' + (it.danger ? ' danger' : ''), onclick: function () { bg.remove(); it.run(); } }, it.label));
    });
    sheet.appendChild(h('button', { class: 'item', onclick: function () { bg.remove(); } }, 'إغلاق'));
    bg.appendChild(sheet);
    document.body.appendChild(bg);
  }

  function openMenu() {
    var items = [];
    if (installEvt) items.push({ label: 'تثبيت التطبيق على الجوال', run: function () { installEvt.prompt(); installEvt = null; } });
    else if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone) {
      items.push({ node: h('div', { class: 'msg info' }, 'لتثبيت التطبيق على الآيفون: زر المشاركة ثم "إضافة إلى الشاشة الرئيسية".') });
    }
    items.push({ label: 'تغيير رابط الخادم', run: function () { renderSetup(true); } });
    items.push({ label: 'تسجيل الخروج', danger: true, run: function () { sessionLost(''); } });
    items.push({ node: h('div', { class: 'muted', style: 'padding-top:10px' }, 'تطبيق تصاريح العمل - نسخة ' + APP_VERSION + (S.user ? ' - ' + S.user.name : '')) });
    openSheet('القائمة', items);
  }

  function spinnerBlock(text) { return h('div', { class: 'center' }, h('span', { class: 'spinner dark' }), h('div', { class: 'muted', text: text || 'لحظة...' })); }

  function btnBusy(btn, on, label) {
    btn.disabled = !!on;
    clear(btn);
    if (on) { btn.appendChild(h('span', { class: 'spinner' })); btn.appendChild(document.createTextNode(' لحظة...')); }
    else btn.appendChild(document.createTextNode(label));
  }

  // ======================= إعداد الرابط =======================
  function renderSetup(canCancel) {
    clear(root);
    var input = h('input', { class: 'input', type: 'url', dir: 'ltr', placeholder: 'https://script.google.com/macros/s/.../exec', value: apiBase(), autocomplete: 'off' });
    var msg = h('div', { class: 'msg err', hidden: true });
    var go = h('button', { class: 'btn', type: 'button' }, 'حفظ واختبار');
    go.addEventListener('click', function () {
      var u = input.value.trim();
      msg.hidden = true;
      if (!validApiUrl(u)) { msg.className = 'msg err'; msg.textContent = 'الرابط غير صحيح. لازم يكون رابط تطبيق الويب المنتهي بـ /exec'; msg.hidden = false; return; }
      btnBusy(go, true);
      fetch(u + '?api=ping').then(function (r) { return r.text(); }).then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) {}
        btnBusy(go, false, 'حفظ واختبار');
        if (j && j.ok && j.api) { lsSet('ptw_api_url', u); toast('تم الاتصال بالخادم'); boot(); return; }
        msg.className = 'msg err';
        msg.textContent = 'وصلت للرابط لكن النسخة المنشورة ما فيها بوابة التطبيق. الصق Api.gs و Telegram.gs و Code.gs بمحرر Apps Script وانشر نسخة جديدة (v2.39-mobile-api).';
        msg.hidden = false;
      }).catch(function () {
        btnBusy(go, false, 'حفظ واختبار');
        msg.className = 'msg err'; msg.textContent = 'تعذر الوصول للرابط. تأكد منه، وإن النشر "Anyone" (أي شخص).'; msg.hidden = false;
      });
    });
    root.appendChild(h('div', { class: 'auth-wrap' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', { text: 'إعداد التطبيق' }), h('div', { class: 'sig' })),
      h('div', { class: 'card' },
        h('p', { class: 'muted', text: 'الصق رابط تطبيق الويب (المنتهي بـ /exec) من نشر Apps Script. تسويها مرة وحدة بس.' }),
        h('div', { class: 'field' }, h('label', { text: 'رابط الخادم' }), input),
        go, msg,
        canCancel && S.user ? h('button', { class: 'btn ghost', style: 'margin-top:10px', type: 'button', onclick: function () { route(); } }, 'إلغاء') : null)));
  }

  // ======================= الدخول والتسجيل =======================
  function renderAuth(note) {
    clear(root);
    var tab = 'login';
    var wrap = h('div', { class: 'auth-wrap' });
    var body = h('div', { class: 'card' });

    function field(id, label, props) {
      return h('div', { class: 'field' }, h('label', { for: id, text: label }), h('input', Object.assign({ id: id, class: 'input' }, props || {})));
    }
    function formLogin() {
      var msg = h('div', { class: 'msg err', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'دخول');
      var f = h('form', { autocomplete: 'on' },
        field('l-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric', autocomplete: 'username' }),
        field('l-pw', 'كلمة السر', { type: 'password', autocomplete: 'current-password' }),
        go, msg);
      if (note) { msg.textContent = note; msg.hidden = false; }
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = f.querySelector('#l-id').value.trim(), pw = f.querySelector('#l-pw').value;
        if (!id || !pw) { msg.className = 'msg err'; msg.textContent = 'اكتب الرقم الوظيفي وكلمة السر.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('loginAccount', [id, pw]).then(function (res) {
          btnBusy(go, false, 'دخول');
          if (res && res.ok && res.token) {
            S.token = res.token; S.user = res.user; lsSet('ptw_token', res.token); lsSet('ptw_user', JSON.stringify(res.user));
            if (!location.hash || location.hash === '#') location.hash = '#/home';
            route();
          } else { msg.className = 'msg err'; msg.textContent = (res && res.message) || 'تعذر الدخول.'; msg.hidden = false; }
        });
      });
      return f;
    }
    function formReg() {
      var msg = h('div', { class: 'msg', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'إرسال الطلب');
      var f = h('form', { autocomplete: 'off' },
        field('r-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric' }),
        field('r-ph', 'رقم الجوال (نفس المسجل عند الشركة)', { type: 'tel', inputmode: 'tel' }),
        field('r-em', 'الإيميل', { type: 'email', dir: 'ltr' }),
        field('r-pw', 'كلمة السر (8 خانات على الأقل، حروف إنجليزية وأرقام)', { type: 'password', autocomplete: 'new-password' }),
        field('r-pw2', 'تأكيد كلمة السر', { type: 'password', autocomplete: 'new-password' }),
        go, msg);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        function v(id) { return f.querySelector('#' + id).value; }
        if (!v('r-id').trim() || !v('r-ph').trim() || !v('r-em').trim() || !v('r-pw')) { msg.className = 'msg err'; msg.textContent = 'عبّ كل الحقول.'; msg.hidden = false; return; }
        if (v('r-pw') !== v('r-pw2')) { msg.className = 'msg err'; msg.textContent = 'كلمة السر وتأكيدها مو متطابقين.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('registerAccount', [v('r-id').trim(), v('r-ph').trim(), v('r-em').trim(), v('r-pw')]).then(function (res) {
          btnBusy(go, false, 'إرسال الطلب');
          msg.className = 'msg ' + (res && res.ok ? 'ok' : 'err'); msg.textContent = (res && res.message) || 'تعذر إرسال الطلب.'; msg.hidden = false;
        });
      });
      return f;
    }
    function formRst() {
      var msg = h('div', { class: 'msg', hidden: true });
      var go = h('button', { class: 'btn', type: 'submit' }, 'حفظ');
      var f = h('form', { autocomplete: 'off' },
        h('p', { class: 'muted', text: 'تستخدمها لما المسؤول يعيد تعيين حسابك.' }),
        field('s-id', 'الرقم الوظيفي', { type: 'text', inputmode: 'numeric' }),
        field('s-ph', 'رقم الجوال', { type: 'tel', inputmode: 'tel' }),
        field('s-pw', 'كلمة السر الجديدة', { type: 'password', autocomplete: 'new-password' }),
        go, msg);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        function v(id) { return f.querySelector('#' + id).value; }
        if (!v('s-id').trim() || !v('s-ph').trim() || !v('s-pw')) { msg.className = 'msg err'; msg.textContent = 'عبّ كل الحقول.'; msg.hidden = false; return; }
        btnBusy(go, true); msg.hidden = true;
        rpc('setInitialPassword', [v('s-id').trim(), v('s-ph').trim(), v('s-pw')]).then(function (res) {
          btnBusy(go, false, 'حفظ');
          msg.className = 'msg ' + (res && res.ok ? 'ok' : 'err'); msg.textContent = (res && res.message) || 'تعذر الحفظ.'; msg.hidden = false;
        });
      });
      return f;
    }
    var tabs = h('div', { class: 'tabs' });
    [['login', 'دخول'], ['reg', 'طلب حساب'], ['rst', 'تعيين كلمة سر']].forEach(function (t) {
      tabs.appendChild(h('button', { type: 'button', 'data-t': t[0], class: t[0] === tab ? 'on' : '', onclick: function () { tab = t[0]; draw(); } }, t[1]));
    });
    function draw() {
      Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
      clear(body); body.appendChild(tabs);
      body.appendChild(tab === 'login' ? formLogin() : tab === 'reg' ? formReg() : formRst());
    }
    wrap.appendChild(h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('h1', { text: 'نظام تصاريح العمل' }), h('div', { class: 'sig' })));
    wrap.appendChild(body);
    wrap.appendChild(h('button', { class: 'btn ghost sm', style: 'margin:0 auto;display:flex', type: 'button', onclick: function () { renderSetup(false); } }, 'تغيير رابط الخادم'));
    root.appendChild(wrap);
    draw();
  }

  // ======================= الرئيسية =======================
  function pageHome() {
    var u = S.user;
    var statsBox = h('div', { class: 'muted', text: '' });
    var content = h('div', null,
      h('div', { class: 'hello' }, h('h2', { text: 'أهلاً ' + u.name }), h('p', { text: u.role + ' - ' + u.empId })));
    if (has('site')) {
      content.appendChild(h('div', { class: 'tiles' },
        h('a', { class: 'tile open', href: '#/site/open' }, icon('open'), h('div', null, 'فتح تصريح', h('small', { text: 'سجّل فتح تصريح عمل' }))),
        h('a', { class: 'tile closeop', href: '#/site/close' }, icon('close'), h('div', null, 'إغلاق تصريح', h('small', { text: 'سجّل إغلاق تصريح' }))),
        h('a', { class: 'tile', href: '#/photos' }, icon('photos'), h('div', null, 'رفع الصور', h('small', { text: 'صور التصاريح والجولات' }))),
        has('mypage') ? h('a', { class: 'tile', href: '#/me' }, icon('me'), h('div', null, 'صفحتي', h('small', { text: 'إحصائياتك هذا الشهر' }))) : null));
    } else if (has('mypage')) {
      content.appendChild(h('div', { class: 'tiles' }, h('a', { class: 'tile wide', href: '#/me' }, icon('me'), h('div', null, 'صفحتي', h('small', { text: 'إحصائياتك هذا الشهر' })))));
    } else {
      content.appendChild(h('div', { class: 'msg warn', text: 'ما عندك صفحات مفعّلة بالتطبيق الحين. كلّم المسؤول.' }));
    }
    content.appendChild(h('div', { class: 'card' }, h('h2', { text: 'هذا الشهر' }), statsBox));
    content.appendChild(h('div', { class: 'msg info', text: 'لوحة التصاريح والمعرض والاجتماعات والتقارير الإدارية قادمة بالتحديثات الجاية. إلى ذلك الوقت تقدر تفتحها من الموقع.' }));
    shell('home', 'نظام تصاريح العمل', content);

    if (has('mypage')) {
      statsBox.textContent = 'جاري التحميل...';
      call('getMyPageStats').then(function (res) {
        if (!statsBox.isConnected) return;
        clear(statsBox);
        if (!res || !res.ok) { statsBox.textContent = ''; return; }
        statsBox.className = '';
        statsBox.appendChild(h('div', { class: 'stats', style: 'margin:0' },
          h('div', { class: 'stat' }, h('div', { class: 'n', text: res.permits.opened }), h('div', { class: 'l', text: 'تصاريح فتحتها' })),
          h('div', { class: 'stat' }, h('div', { class: 'n', text: res.permits.closed }), h('div', { class: 'l', text: 'تصاريح أغلقتها' }))));
      });
    } else { statsBox.parentNode.remove(); }
  }

  // ======================= تسجيل فتح / إغلاق =======================
  var PHOTO_KEYS = [['permit', 'صورة التصريح'], ['hazards', 'خطوات العمل والمخاطر'], ['participants', 'أسماء المشاركين في TBT'], ['tbt', 'TBT'], ['site', 'صورة موقع العمل']];
  var CLOSE_KEYS = [['closed', 'صورة التصريح مغلق'], ['site_after', 'صورة موقع العمل بعد الإغلاق']];
  var STATUS_AR = { active: 'سارٍ', expired: 'منتهي', upcoming: 'لم يبدأ' };

  /** حقول رفع ملفات: يرجع {node, inputs:[{key,input}]} */
  function fileFields(keys, prefix) {
    var inputs = [];
    var node = h('div', null, keys.map(function (k, i) {
      var inp = h('input', { type: 'file', accept: 'image/*,video/*,application/pdf', id: prefix + k[0] });
      var picked = h('div', { class: 'picked', hidden: true });
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) { picked.textContent = '✓ ' + inp.files[0].name; picked.hidden = false; } else picked.hidden = true; });
      inputs.push({ key: k[0], input: inp });
      return h('div', { class: 'file' }, h('label', { class: 't', for: prefix + k[0], text: (i + 1) + ') ' + k[1] }), inp, picked);
    }));
    return { node: node, inputs: inputs };
  }
  function collectChosen(ff) { return ff.inputs.filter(function (x) { return x.input.files && x.input.files[0]; }).map(function (x) { return { key: x.key, file: x.input.files[0] }; }); }
  function buildPhotos(chosen) {
    return Promise.all(chosen.map(function (c) { return filePayload(c.file); })).then(function (pls) {
      var photos = {}; pls.forEach(function (p, i) { photos[chosen[i].key] = p; }); return photos;
    });
  }

  function pageSite(op0) {
    var st = { op: op0 === 'close' ? 'close' : 'open', ptw: '', first: false, busy: false };
    var box = h('div');
    shell('site', 'تسجيل فتح / إغلاق', box);

    function step1(prefill) {
      clear(box);
      var ptwIn = h('input', { class: 'input big', type: 'text', id: 'ptw', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'مثال: 5 أو SEP.5', value: prefill || '' });
      var noteIn = h('input', { class: 'input', type: 'text', id: 'note', maxlength: '300', autocomplete: 'off', placeholder: 'ملاحظة (اختياري)' });
      var msg = h('div', { class: 'msg err', hidden: true });
      var ambig = h('div', { hidden: true });
      var segOpen = h('button', { type: 'button', class: st.op === 'open' ? 'on' : '' }, 'فتح');
      var segClose = h('button', { type: 'button', class: st.op === 'close' ? 'on close' : '' }, 'إغلاق');
      var go = h('button', { class: 'btn' + (st.op === 'close' ? ' danger' : ''), type: 'button' }, 'متابعة');
      function setOp(o) {
        st.op = o;
        segOpen.className = o === 'open' ? 'on' : ''; segClose.className = o === 'close' ? 'on close' : '';
        go.className = 'btn' + (o === 'close' ? ' danger' : '');
      }
      segOpen.addEventListener('click', function () { setOp('open'); });
      segClose.addEventListener('click', function () { setOp('close'); });
      function check(forced) {
        if (st.busy) return;
        var ptw = (forced || ptwIn.value).trim();
        msg.hidden = true; ambig.hidden = true; clear(ambig);
        if (!ptw) { msg.textContent = 'اكتب رقم التصريح.'; msg.hidden = false; return; }
        st.busy = true; btnBusy(go, true);
        call('lookupPermit', ptw, st.op).then(function (res) {
          st.busy = false; btnBusy(go, false, 'متابعة');
          if (!res || !res.ok) {
            if (res && res.code === 'AUTH') return;
            if (res && res.ambiguous) {
              ambig.appendChild(h('div', { class: 'msg warn', text: res.message }));
              (res.candidates || []).forEach(function (c) {
                var sub = [c.location, c.openedBy ? 'فتحه ' + c.openedBy + (c.openedAt ? ' - ' + c.openedAt : '') : ''].filter(Boolean).join(' · ');
                ambig.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { check(c.ptw); } },
                  h('div', null, h('b', null, ltr(c.ptw)), c.company ? ' - ' + c.company : ''), h('div', { class: 'sub', text: sub })));
              });
              ambig.hidden = false; return;
            }
            msg.textContent = (res && res.message) || 'صار خطأ. حاول مرة ثانية.'; msg.hidden = false; return;
          }
          step2(res, noteIn.value.trim());
        });
      }
      go.addEventListener('click', function () { check(); });
      ptwIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      box.appendChild(h('div', { class: 'card' },
        h('h2', { text: 'تسجيل فتح / إغلاق تصريح' }),
        h('div', { class: 'seg' }, segOpen, segClose),
        h('div', { class: 'field' }, h('label', { for: 'ptw', text: 'رقم التصريح' }), ptwIn),
        h('div', { class: 'field' }, noteIn),
        go, msg, ambig));
      if (!prefill) setTimeout(function () { try { ptwIn.focus(); } catch (e) {} }, 50);
    }

    function row(k, v) { return h('div', { class: 'drow' }, h('span', { class: 'k', text: k }), h('span', { class: 'v' }, v || '-')); }

    function step2(d, note) {
      clear(box);
      var isOpen = st.op === 'open';
      var p = d.permit;
      st.ptw = p.ptw; st.first = isOpen && !!d.firstOpen;
      var badge = h('span', { class: 'badge ' + (STATUS_AR[d.status] ? d.status : 'unknown'), text: STATUS_AR[d.status] || 'غير معروف' });
      var details = h('div', { class: 'details' },
        row('الموظف', d.employee.name + ' (' + d.employee.id + ')'),
        row('رقم التصريح', ltr(p.ptw)), row('الحالة', badge), row('الشركة', p.company),
        row('الفترة', [ltr(p.startDate || '?'), '  إلى  ', ltr(p.endDate || '?')]),
        row('الموقع', (p.location || '') + (p.floor ? ' - ' + p.floor : '')),
        row('وصف الأعمال', p.description), row('النوع', p.type), row('المصدر', p.issuer),
        row('المستلم', p.receiver), row('الجوال', p.phone ? ltr(p.phone) : ''), row('الوردية', p.shift));
      var warn = null;
      if (d.warnings && d.warnings.length) {
        warn = h('div', { class: 'msg warn', style: 'margin:0 0 14px' }, h('b', { text: 'تنبيه (تقدر تكمل والعملية بتنسجل):' }),
          h('ul', null, d.warnings.map(function (w) { return h('li', { text: w }); })));
      }
      var ff = st.first ? fileFields(PHOTO_KEYS, 'op-') : null;
      var msg = h('div', { class: 'msg err', hidden: true });
      var noteIn = h('input', { class: 'input', type: 'text', maxlength: '300', placeholder: 'ملاحظة (اختياري)', value: note || '' });
      var confirm = h('button', { class: 'btn' + (isOpen ? '' : ' danger'), type: 'button' }, isOpen ? 'اعتماد الفتح' : 'اعتماد الإغلاق');
      var back = h('button', { class: 'btn gray', type: 'button' }, 'رجوع وتعديل');
      back.addEventListener('click', function () { if (!st.busy) step1(st.ptw); });
      confirm.addEventListener('click', function () {
        if (st.busy) return;
        st.busy = true; btnBusy(confirm, true); back.disabled = true; msg.hidden = true;
        call('submitOperation', st.ptw, st.op, noteIn.value.trim()).then(function (res) {
          st.busy = false; back.disabled = false; btnBusy(confirm, false, isOpen ? 'اعتماد الفتح' : 'اعتماد الإغلاق');
          if (!res || !res.ok) {
            if (res && res.code === 'AUTH') return;
            msg.textContent = (res && res.message) || 'صار خطأ. حاول مرة ثانية.'; msg.hidden = false; return;
          }
          step3(res, ff ? collectChosen(ff) : []);
        });
      });
      box.appendChild(h('div', { class: 'card' },
        h('h2', { text: isOpen ? 'تأكيد فتح التصريح' : 'تأكيد إغلاق التصريح' }),
        warn, details,
        ff ? h('div', null, h('div', { class: 'muted', style: 'margin-bottom:8px', text: 'أول فتح لهذا التصريح، تقدر ترفع الصور الحين (اختياري):' }), ff.node) : null,
        h('div', { class: 'field' }, noteIn),
        confirm, back, msg));
      window.scrollTo(0, 0);
    }

    function step3(res, chosen) {
      clear(box);
      var verb = res.op === 'فتح' ? 'فتحت' : 'أغلقت';
      var flagged = res.flags && res.flags.length;
      var result = h('div', { class: 'msg ' + (flagged ? 'warn' : 'ok'), style: 'font-size:16px' });
      if (flagged) {
        result.appendChild(document.createTextNode('تم تسجيل العملية (' + res.op + ') للتصريح '));
        result.appendChild(ltr(res.ptw));
        result.appendChild(document.createTextNode('، لكن يبدو إنك ' + verb + ' تصريح غلط: ' + res.flags.join('، ') + '. تراك مسجل عليك، وبنراجعه آخر اليوم.'));
      } else {
        result.appendChild(document.createTextNode('تم تسجيل ' + res.op + ' التصريح '));
        result.appendChild(ltr(res.ptw));
        result.appendChild(document.createTextNode(' بنجاح ('));
        result.appendChild(ltr(res.time));
        result.appendChild(document.createTextNode(').'));
      }
      if (res.duplicate) result.appendChild(h('div', { text: '(كانت مسجلة قبل لحظات، ما انسجلت مرة ثانية.)' }));
      var photoStatus = h('div', { hidden: true });
      var again = h('button', { class: 'btn', type: 'button', onclick: function () { st.ptw = ''; step1(''); } }, 'تسجيل تصريح ثاني');
      box.appendChild(h('div', { class: 'card', style: 'text-align:center' },
        h('div', { style: 'font-size:48px', text: flagged ? '⚠️' : '✅' }), result, photoStatus,
        h('div', { style: 'margin-top:16px' }, again)));
      window.scrollTo(0, 0);
      if (chosen.length) {
        photoStatus.className = 'msg info'; photoStatus.textContent = 'جاري حفظ الصور...'; photoStatus.hidden = false;
        buildPhotos(chosen).then(function (photos) { return call('uploadPermitPhotos', res.ptw, photos); }).then(function (r) {
          if (r && r.ok) { photoStatus.className = 'msg ok'; photoStatus.textContent = r.extraFiles ? 'تم حفظ المرفقات بنجاح.' : 'تم حفظ الصور بنجاح بملف PDF واحد.'; }
          else { photoStatus.className = 'msg err'; photoStatus.textContent = 'تعذر حفظ المرفقات' + (r && r.message ? ': ' + r.message : '') + '. التسجيل نفسه تم، وتقدر ترفعها من "الصور".'; }
        }).catch(function (e) { photoStatus.className = 'msg err'; photoStatus.textContent = 'تعذر معالجة الصور: ' + (e && e.message ? e.message : 'خطأ غير معروف'); });
      }
    }
    step1('');
  }

  // ======================= رفع الصور =======================
  var LEVELS = ['البدروم', 'الأرضي', 'الأرضي ميزانين', 'رزد الأول', 'الأول', 'رزد الأول ميزانين', 'الأول ميزانين', 'رزد الثاني', 'الثاني', 'رزد الثاني ميزانين', 'الثاني ميزانين', 'الثالث', 'رزد السطح', 'السطح', 'السطح العلوي', 'الواجهة'];
  var ZONES = [1, 2, 3, 4, 5, 'شمالية', 'جنوبية', 'شرقية', 'غربية'];
  var ROUND_TYPES = ['جولة عامة في الموقع', 'متابعة أعمال', 'جولة مع دار الهندسة', 'جولة مع التنفيذ', 'فحص الطفايات', 'فحص صناديق الحريق', 'فحص المكاتب والمستودعات', 'فحص السلالم', 'فحص الحواف', 'التخزينات الموقتة', 'جولة تسليمات', 'جولات مع فريق التنفيذ', 'جولات مع مدير المشروع', 'المواد المتساقطه', 'يوم الجمعه', 'امان والطلاقي', 'الدفاع المدني', 'بريتام', 'الماليه', 'أخرى'];

  function pagePhotos() {
    var box = h('div');
    shell('photos', 'رفع الصور', box);

    function tile(title, sub, fn) { return h('button', { class: 'list-item', type: 'button', style: 'text-align:center;padding:20px', onclick: fn }, h('b', { text: title }), h('div', { class: 'sub', text: sub })); }
    function backBtn(fn) { return h('button', { class: 'btn gray', type: 'button', onclick: fn }, 'رجوع'); }

    function main() {
      clear(box);
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'رفع الصور' }),
        tile('صور التصاريح', 'صور فتح وإغلاق التصاريح', permitsType),
        tile('صور جولات ومتابعة أعمال', 'حسب الدور والزون ونوع الجولة', rounds)));
    }
    function permitsType() {
      clear(box);
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'صور التصاريح' }),
        tile('صور الفتح', '5 خانات ساعة الفتح', function () { myPermits('open'); }),
        tile('صور الإغلاق', 'خانتين ساعة الإغلاق', function () { myPermits('close'); }),
        backBtn(main)));
    }
    function myPermits(kind) {
      clear(box);
      var list = h('div'); var card = h('div', { class: 'card' }, h('h2', { text: kind === 'open' ? 'اختر التصريح (صور الفتح)' : 'اختر التصريح (صور الإغلاق)' }), list, backBtn(permitsType));
      box.appendChild(card);
      list.appendChild(spinnerBlock('جاري تحميل تصاريحك...'));
      call('getMyOpenedPermits').then(function (res) {
        clear(list);
        if (!res || !res.ok) { if (res && res.code === 'AUTH') return; list.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'صار خطأ. حاول مرة ثانية.' })); return; }
        if (!res.permits.length) { list.appendChild(h('div', { class: 'muted', style: 'text-align:center;padding:16px', text: 'ما فيه تصاريح فتحتها لين الحين.' })); return; }
        res.permits.forEach(function (p) {
          list.appendChild(h('button', { class: 'list-item', type: 'button', onclick: function () { uploadForm(kind, p.ptw); } },
            h('div', null, h('b', null, ltr(p.ptw)), p.company ? ' - ' + p.company : ''),
            h('div', { class: 'sub', text: [p.location, p.lastOpenedAt ? 'آخر فتح: ' + p.lastOpenedAt : ''].filter(Boolean).join(' · ') })));
        });
      });
    }
    function uploadForm(kind, ptw) {
      clear(box);
      var ff = fileFields(kind === 'open' ? PHOTO_KEYS : CLOSE_KEYS, 'up-');
      var msg = h('div', { hidden: true });
      var go = h('button', { class: 'btn', type: 'button' }, 'رفع الصور');
      var back = backBtn(function () { myPermits(kind); });
      var busy = false;
      go.addEventListener('click', function () {
        if (busy) return;
        var chosen = collectChosen(ff);
        if (!chosen.length) { msg.className = 'msg err'; msg.textContent = 'اختر ملف واحد على الأقل.'; msg.hidden = false; return; }
        busy = true; btnBusy(go, true); back.disabled = true; msg.hidden = true;
        buildPhotos(chosen).then(function (photos) { return call(kind === 'open' ? 'uploadPermitPhotos' : 'uploadPermitClosePhotos', ptw, photos); }).then(function (res) {
          busy = false; btnBusy(go, false, 'رفع الصور'); back.disabled = false;
          if (!res || !res.ok) { if (res && res.code === 'AUTH') return; msg.className = 'msg err'; msg.textContent = (res && res.message) || 'تعذر حفظ المرفقات. حاول مرة ثانية.'; msg.hidden = false; return; }
          msg.className = 'msg ok'; msg.textContent = res.extraFiles ? 'تم حفظ المرفقات بنجاح.' : 'تم حفظ الصور بنجاح بملف PDF واحد.'; msg.hidden = false;
          ff.inputs.forEach(function (x) { x.input.value = ''; x.input.dispatchEvent(new Event('change')); });
        }).catch(function (e) {
          busy = false; btnBusy(go, false, 'رفع الصور'); back.disabled = false;
          msg.className = 'msg err'; msg.textContent = 'تعذر معالجة المرفقات: ' + (e && e.message ? e.message : 'خطأ غير معروف'); msg.hidden = false;
        });
      });
      box.appendChild(h('div', { class: 'card' }, h('h2', null, (kind === 'open' ? 'صور فتح التصريح ' : 'صور إغلاق التصريح '), ltr(ptw)), ff.node, go, back, msg));
      window.scrollTo(0, 0);
    }
    function chipGroup(values, labelOf) {
      var wrap = h('div', { class: 'chips' }); var cbs = [];
      values.forEach(function (v) {
        var cb = h('input', { type: 'checkbox', value: String(v) });
        var lab = h('label', { class: 'chip' }, cb, labelOf ? labelOf(v) : String(v));
        cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
        cbs.push(cb); wrap.appendChild(lab);
      });
      return { node: wrap, values: function () { return cbs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }, reset: function () { cbs.forEach(function (c) { c.checked = false; c.parentNode.classList.remove('on'); }); } };
    }
    function rounds() {
      clear(box);
      var type = h('select', { class: 'input', id: 'rType' }, h('option', { value: '', text: '— اختر نوع الصور —' }), ROUND_TYPES.map(function (t) { return h('option', { value: t, text: t }); }));
      var lv = chipGroup(LEVELS), zn = chipGroup(ZONES, function (z) { return typeof z === 'number' ? 'زون ' + z : z; });
      var desc = h('textarea', { class: 'input', maxlength: '500', placeholder: 'وصف (اختياري)' });
      var files = h('input', { type: 'file', accept: 'image/*,video/*,application/pdf', multiple: true });
      var msg = h('div', { hidden: true });
      var go = h('button', { class: 'btn', type: 'button' }, 'رفع');
      var back = backBtn(main); var busy = false;
      go.addEventListener('click', function () {
        if (busy) return;
        var levels = lv.values(), zones = zn.values(), fl = files.files ? Array.prototype.slice.call(files.files) : [];
        function err(t) { msg.className = 'msg err'; msg.textContent = t; msg.hidden = false; }
        if (!levels.length && !zones.length) return err('اختر دور أو زون واحد على الأقل.');
        if (!type.value) return err('اختر نوع الصور.');
        if (!fl.length) return err('اختر ملف واحد على الأقل.');
        if (fl.length > 20) return err('أقصى عدد ملفات بالمرة الواحدة 20.');
        busy = true; btnBusy(go, true); back.disabled = true; msg.hidden = true;
        Promise.all(fl.map(filePayload)).then(function (photos) {
          return call('uploadRoundPhotos', { levels: levels, zones: zones, roundType: type.value, description: desc.value.trim(), photos: photos });
        }).then(function (res) {
          busy = false; btnBusy(go, false, 'رفع'); back.disabled = false;
          if (!res || !res.ok) { if (res && res.code === 'AUTH') return; return err((res && res.message) || 'تعذر حفظ الملفات. حاول مرة ثانية.'); }
          msg.className = 'msg ok'; msg.textContent = 'تم حفظ ' + res.count + ' ملف بنجاح.'; msg.hidden = false;
          lv.reset(); zn.reset(); type.value = ''; desc.value = ''; files.value = '';
        }).catch(function (e) { busy = false; btnBusy(go, false, 'رفع'); back.disabled = false; err('تعذر معالجة الملفات: ' + (e && e.message ? e.message : 'خطأ غير معروف')); });
      });
      box.appendChild(h('div', { class: 'card' }, h('h2', { text: 'صور جولات ومتابعة أعمال' }),
        h('div', { class: 'field' }, h('label', { for: 'rType', text: 'نوع الصور' }), type),
        h('div', { class: 'field' }, h('label', { text: 'الأدوار' }), lv.node),
        h('div', { class: 'field' }, h('label', { text: 'الزونات' }), zn.node),
        h('div', { class: 'field' }, h('label', { text: 'وصف' }), desc),
        h('div', { class: 'field' }, h('label', { text: 'الملفات' }), h('div', { class: 'file' }, files)),
        go, back, msg));
      window.scrollTo(0, 0);
    }
    main();
  }

  // ======================= صفحتي =======================
  function pageMe() {
    var now = new Date(), curY = now.getFullYear(), curM = now.getMonth() + 1;
    var st = { y: curY, m: curM, section: '', data: null };
    var box = h('div');
    shell('me', 'صفحتي', box);

    var label = h('div', { class: 'lbl' });
    var body = h('div');
    var prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر السابق' }, icon('back'));
    var next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر التالي' }, icon('next'));
    prev.addEventListener('click', function () { shiftMonth(-1); });
    next.addEventListener('click', function () { shiftMonth(1); });
    box.appendChild(h('div', { class: 'months' }, prev, label, next));
    box.appendChild(body);

    function shiftMonth(d) {
      var m = st.m + d, y = st.y;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      if (y > curY || (y === curY && m > curM)) return;
      st.y = y; st.m = m; st.section = ''; load();
    }
    function load() {
      label.textContent = MONTHS[st.m] + ' ' + st.y;
      next.disabled = (st.y === curY && st.m === curM);
      clear(body); body.appendChild(spinnerBlock('جاري تحميل بياناتك...'));
      call('getMyPageStats', { year: st.y, month: st.m }).then(function (res) {
        if (!body.isConnected) return;
        clear(body);
        if (!res || !res.ok) {
          if (res && res.code === 'AUTH') return;
          body.appendChild(h('div', { class: 'msg err', text: (res && res.message) || 'تعذر جلب بياناتك.' }));
          body.appendChild(h('button', { class: 'btn', style: 'margin-top:12px', type: 'button', onclick: load }, 'إعادة المحاولة'));
          return;
        }
        st.data = res; render();
      });
    }
    function render() {
      var d = st.data; clear(body);
      var detail = h('div', { class: 'card' });
      var defs = [
        ['opened', d.permits.opened, 'تصاريح فتحتها'], ['closed', d.permits.closed, 'تصاريح أغلقتها'],
        ['meetings', d.meetings.count, 'اجتماعات'], ['rounds', d.rounds.count, 'صور جولات'],
        ['obs', d.observations.total, 'ملاحظات السلامة (كل الفترة)', true]
      ];
      var grid = h('div', { class: 'stats' });
      defs.forEach(function (x) {
        grid.appendChild(h('button', { class: 'stat' + (x[3] ? ' wide' : '') + (st.section === x[0] ? ' on' : ''), type: 'button', onclick: function () { st.section = st.section === x[0] ? '' : x[0]; render(); } },
          h('div', { class: 'n', text: x[1] }), h('div', { class: 'l', text: x[2] })));
      });
      body.appendChild(grid);
      if (st.section) { fillDetail(detail, st.section); body.appendChild(detail); }
    }
    function linkTo(url, text) { var u = safeUrl(url); return u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, text) : null; }
    function empty(t) { return h('div', { class: 'muted', style: 'text-align:center;padding:12px', text: t }); }
    function fillDetail(card, sec) {
      var d = st.data;
      if (sec === 'opened' || sec === 'closed') {
        var list = sec === 'opened' ? d.permits.openedList : d.permits.closedList;
        card.appendChild(h('h2', { text: sec === 'opened' ? 'التصاريح اللي فتحتها' : 'التصاريح اللي أغلقتها' }));
        if (!list.length) card.appendChild(empty('ما فيه شي بهذا الشهر.'));
        list.forEach(function (p) { card.appendChild(h('div', { class: 'rowitem' }, ltr(p))); });
      } else if (sec === 'meetings') {
        card.appendChild(h('h2', { text: 'الاجتماعات' }));
        if (!d.meetings.list.length) card.appendChild(empty('ما فيه اجتماعات بهذا الشهر.'));
        d.meetings.list.forEach(function (m) { card.appendChild(h('div', { class: 'rowitem' }, ltr(m.meetingNo), ' — ' + (m.topic || '-') + ' ', ltr(m.dateTime), linkTo(m.fileUrl, 'فتح المحضر'))); });
      } else if (sec === 'rounds') {
        card.appendChild(h('h2', { text: 'صور الجولات' }));
        if (!d.rounds.list.length) card.appendChild(empty('ما فيه صور جولات بهذا الشهر.'));
        d.rounds.list.forEach(function (r) {
          var loc = [r.levels, r.zones].filter(Boolean).join(' - ');
          card.appendChild(h('div', { class: 'rowitem' }, ltr(r.time), ' — ' + r.type + (loc ? ' (' + loc + ')' : '') + (r.description ? ' — ' + r.description : ''), linkTo(r.fileUrl, 'فتح الملف')));
        });
      } else if (sec === 'obs') {
        card.appendChild(h('h2', { text: 'ملاحظات السلامة' }));
        var months = Object.keys(d.observations.byMonth || {}).sort().reverse();
        var sel = h('select', { class: 'input', style: 'margin-bottom:12px' }, h('option', { value: '', text: 'كل الفترة (' + d.observations.total + ')' }),
          months.map(function (ym) { var p = ym.split('-'); return h('option', { value: ym, text: MONTHS[Number(p[1])] + ' ' + p[0] + ' (' + d.observations.byMonth[ym] + ')' }); }));
        var listBox = h('div');
        function draw() {
          clear(listBox);
          var items = (d.observations.list || []).filter(function (o) { return !sel.value || o.ym === sel.value; });
          if (!items.length) { listBox.appendChild(empty('ما فيه ملاحظات مطابقة.')); return; }
          items.forEach(function (o) {
            var links = extractUrls(o.photoBefore).map(function (u) { return linkTo(u, 'صورة قبل'); }).concat(extractUrls(o.photoAfter).map(function (u) { return linkTo(u, 'صورة بعد'); }));
            listBox.appendChild(h('div', { class: 'rowitem' },
              h('div', null, o.category ? h('span', { class: 'tag', text: o.category }) : null, o.type ? h('span', { class: 'tag', text: o.type }) : null, o.risk ? h('span', { class: 'tag', text: 'الخطورة: ' + o.risk }) : null),
              h('div', { class: 'muted' }, ltr(o.time), [o.zone, o.shift].filter(Boolean).length ? ' · ' + [o.zone, o.shift].filter(Boolean).join(' · ') : ''),
              o.description ? h('div', { text: o.description }) : null,
              o.correctiveAction ? h('div', { class: 'muted', text: 'الإجراء التصحيحي: ' + o.correctiveAction }) : null,
              links.length ? h('div', null, links) : null));
          });
        }
        sel.addEventListener('change', draw);
        card.appendChild(sel); card.appendChild(listBox); draw();
      }
    }
    load();
  }

  // ======================= التوجيه والإقلاع =======================
  function route() {
    if (!apiBase()) return renderSetup(false);
    if (!S.token || !S.user) return renderAuth('');
    var parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    var key = parts[0] || 'home';
    if ((key === 'site' || key === 'photos') && !has('site')) key = 'home';
    if (key === 'me' && !has('mypage')) key = 'home';
    if (key === 'site') return pageSite(parts[1]);
    if (key === 'photos') return pagePhotos();
    if (key === 'me') return pageMe();
    return pageHome();
  }
  window.addEventListener('hashchange', function () { if (S.user) route(); });
  window.addEventListener('online', function () { if (S.user) route(); });
  window.addEventListener('offline', function () { if (S.user) route(); });

  function boot() {
    if (!apiBase()) return renderSetup(false);
    S.token = lsGet('ptw_token');
    if (!S.token) return renderAuth('');
    clear(root); root.appendChild(spinnerBlock('جاري التحميل...'));
    rpc('whoami', [S.token]).then(function (res) {
      if (res && res.ok && res.user) { S.user = res.user; lsSet('ptw_user', JSON.stringify(res.user)); return route(); }
      if (res && (res.code === 'AUTH' || res.code === 'FORBIDDEN')) return sessionLost(res.code === 'AUTH' ? '' : '');
      // خطأ شبكة أو خادم: لو عندنا بيانات المستخدم المحفوظة نكمل (وضع بدون اتصال جزئي)
      var cached = null; try { cached = JSON.parse(lsGet('ptw_user') || 'null'); } catch (e) {}
      if (cached && cached.perms) { S.user = cached; return route(); }
      clear(root);
      root.appendChild(h('div', { class: 'auth-wrap' }, h('div', { class: 'card center' },
        h('div', { class: 'msg err', text: (res && res.message) || 'تعذر الاتصال بالخادم.' }),
        h('button', { class: 'btn', type: 'button', onclick: boot }, 'إعادة المحاولة'),
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { renderSetup(false); } }, 'تغيير رابط الخادم'))));
    });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  boot();
})();
