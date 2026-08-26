// اسم الكاش - غيّرته لنسخة جديدة عشان يجبر تنضيف أي نسخة قديمة متخزنة
const CACHE_NAME = 'elnokhba-cache-v3';

// أول ما نسخة جديدة من الملف ده تتحمل، تتفعل على طول من غير ما تستنى
// المستخدم يقفل كل التابات المفتوحة
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// وقت التفعيل: امسح أي كاش قديم باسم مختلف، وخد تحكم في الصفحات
// المفتوحة فورًا من غير ما يحتاج المستخدم يعمل reload يدوي
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // الصفحة الرئيسية (index.html): يحاول ياخد أحدث نسخة من الإنترنت الأول.
  // لو النت موجود، هياخد آخر تحديث فورًا (وده اللي كان ناقص وسبب المشكلة).
  // لو مفيش نت، يرجع للنسخة المحفوظة عشان التطبيق يفضل شغال أوفلاين.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, {cache: 'no-store'})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // باقي الملفات (أيقونات، manifest.json...): ياخدها من الكاش الأول لو
  // موجودة (أسرع وبيشتغل أوفلاين)، وفي نفس الوقت يحدّثها من النت في الخلفية
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
