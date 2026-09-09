// Service Worker للتطبيق - تفعيل PWA
const CACHE_NAME = 'quiz-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://cdn.socket.io/4.5.4/socket.io.min.js'
];

// تثبيت Service Worker والتخزين المؤقت
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📦 تخزين الملفات مؤقتاً...');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// تفعيل Service Worker وتنظيف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ حذف الكاش القديم:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// استراتيجية الشبكة أولاً ثم الكاش
self.addEventListener('fetch', event => {
  // تجاهل طلبات WebSocket
  if (event.request.url.includes('socket.io')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // حفظ النسخة الجديدة في الكاش
        if (!response || response.status !== 200 || response.type === 'basic') {
          return response;
        }
        
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        
        return response;
      })
      .catch(() => {
        // في حالة عدم الاتصال، استخدم الكاش
        return caches.match(event.request).then(response => {
          return response || new Response('التطبيق يحتاج إلى اتصال بالإنترنت للعب', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain; charset=utf-8'
            })
          });
        });
      })
  );
});
