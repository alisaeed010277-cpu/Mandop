// اسم الكاش - ثابت عمدًا (متغيّرش لـ v4) عشان مكتبات قارئ الباركود المتخزنة عند العملاء ماتتمسحش
const CACHE_NAME = 'elnokhba-cache-v3';

// مهلة انتظار النت للصفحة الرئيسية: لو النت بطيء أو إشارته ضعيفة وفي نسخة محفوظة،
// نفتح من النسخة المحفوظة بعد المدة دي بدل ما العميل يشوف شاشة بيضا، والتحديث يكمل في الخلفية
const NAV_TIMEOUT_MS = 4000;

// الملفات الأساسية اللي بتتخزن وقت التثبيت، عشان التطبيق يفتح أوفلاين حتى لو العميل
// قطع النت بعد أول زيارة مباشرة. أي ملف ناقص أو فشل تحميله بيتخطى بهدوء ومبيوقفش التثبيت
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// مكتبات الفاير بيز والمصادقة بتاعة جوجل (اتشالت من التطبيق) - بنمسحها من الكاش بس
const OLD_FIREBASE_RE = /gstatic\.com\/firebasejs|firebaseio\.com|firebaseapp\.com|identitytoolkit\.googleapis\.com|firestore\.googleapis\.com|apis\.google\.com/;

// نخزّن بس الردود السليمة. الردود الـ opaque (زي مكتبات الباركود من jsdelivr) لازم تتخزن برضه،
// لأن أي سكريبت من دومين تاني بيرجع بالشكل ده ولو منخزنهوش مش هيشتغل أوفلاين
function isCacheable(res) {
  if (!res) return false;
  if (res.type === 'opaque') return true;
  return res.ok && !res.redirected;
}

// أول ما نسخة جديدة من الملف ده تتحمل، تتفعل على طول من غير ما تستنى
// المستخدم يقفل كل التابات المفتوحة
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(PRECACHE_URLS.map(url =>
        new Promise(resolve => resolve(fetch(new Request(url, { cache: 'reload' }))))
          .then(res => isCacheable(res) && res.type !== 'opaque' ? cache.put(url, res) : null)
          .catch(() => null)
      )))
      .catch(() => null)   // التخزين المسبق مجرد تحسين: مهما حصل مايفشلش التثبيت
  );
});

// وقت التفعيل: امسح أي كاش قديم باسم مختلف، وامسح بس بقايا مكتبات الفاير بيز من الكاش الحالي،
// وخد تحكم في الصفحات المفتوحة فورًا من غير ما يحتاج المستخدم يعمل reload يدوي
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => caches.open(CACHE_NAME))
      .then(cache => cache.keys().then(reqs => Promise.all(
        reqs.filter(r => OLD_FIREBASE_RE.test(r.url)).map(r => cache.delete(r))
      )))
      .catch(() => null)   // التنضيف مايوقفش التفعيل أبدًا
      .then(() => self.clients.claim())
  );
});

// الصفحة الرئيسية (index.html): نحاول ناخد أحدث نسخة من الإنترنت، بشرط:
//  - لو النت مقطوع أو الرد 404/5xx أو أبطأ من المهلة، نفتح من النسخة المحفوظة
//  - مبنخزنش غير الردود السليمة (عشان صفحة خطأ من جيت هب ماتتخزنش بدل التطبيق)
//  - لو مفيش نسخة محفوظة أصلًا، بنستنى النت زي الأول
function handleNavigate(event) {
  const req = event.request;
  let finishBg;
  event.waitUntil(new Promise(r => { finishBg = r; }));   // نخلّي الـ worker صاحي لحد ما التحديث يتخزن
  return (async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const fromCache = async () =>
        (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));

      let putDone = Promise.resolve();
      const network = new Promise(resolve => resolve(fetch(req, { cache: 'no-store' }))).then(res => {
        if (isCacheable(res)) putDone = cache.put(req, res.clone()).catch(() => null);
        return res;
      });
      network.then(() => putDone, () => null).then(finishBg, finishBg);

      let timer;
      const timeout = new Promise(r => { timer = setTimeout(() => r(null), NAV_TIMEOUT_MS); });

      let res = null;
      try {
        const first = await Promise.race([network, timeout]);
        clearTimeout(timer);
        if (first !== null) {
          res = first;
        } else {
          const c = await fromCache();      // بطيء: افتح المحفوظ لو موجود
          if (c) return c;
          res = await network;              // مفيش محفوظ: استنى النت
        }
      } catch (e) {
        clearTimeout(timer);                // النت مقطوع
      }

      if (res && res.status < 500 && res.status !== 404) return res;
      const c = await fromCache();
      if (c) return c;
      return res || Response.error();
    } catch (e) {
      // مشكلة في التخزين نفسه (مساحة ممتلئة مثلًا): نرجع للسلوك البسيط ونفتح من النت مباشرة
      finishBg();
      try { return await fetch(req, { cache: 'no-store' }); } catch (e2) { return Response.error(); }
    }
  })();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!/^https?:/i.test(req.url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // باقي الملفات (أيقونات، manifest.json، مكتبات الباركود...): ياخدها من الكاش الأول لو
  // موجودة (أسرع وبيشتغل أوفلاين)، وفي نفس الوقت يحدّثها من النت في الخلفية
  let finishBg;
  event.waitUntil(new Promise(r => { finishBg = r; }));   // الـ worker يفضل صاحي لحد ما التحديث يتخزن فعلًا
  event.respondWith(
    caches.match(req).catch(() => undefined).then(cached => {
      try {
        let putDone = Promise.resolve();
        const fetchPromise = new Promise(resolve => resolve(fetch(req)))
          .then(res => {
            if (isCacheable(res)) {
              const copy = res.clone();
              putDone = caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => null);
            }
            return res;
          })
          .catch(() => cached || Response.error());
        fetchPromise.then(() => putDone, () => null).then(finishBg, finishBg);
        return cached || fetchPromise;
      } catch (e) {
        finishBg();
        return cached || Response.error();
      }
    })
  );
});
