const CACHE_NAME = 'vet-app-cache-v1';
const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// عند التثبيت: نخزن نسخة أولية ونفعّل السيرفس ووركر فورًا من غير انتظار
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(()=>{}))
  );
});

// عند التفعيل: نمسح أي كاش قديم ونتحكم في كل الصفحات المفتوحة فورًا
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// استراتيجية "الشبكة أولاً": أي فتح للتطبيق وهو أونلاين بيجيب آخر نسخة رفعتها على طول
// ولو أوفلاين، بيرجع لآخر نسخة محفوظة في الكاش عشان يفضل شغال من غير نت
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req).then(networkRes => {
      const resClone = networkRes.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
      return networkRes;
    }).catch(() => {
      return caches.match(req).then(cached => cached || caches.match('./'));
    })
  );
});
