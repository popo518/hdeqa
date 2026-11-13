const CACHE_NAME = 'hadiqati-shell-v1';
const CORE_FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest', './assets/logo.svg', './assets/favicon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './js/app.js', './js/db.js', './js/content.js', './js/world.js', './js/sync.js', './supabase/schema.sql'
];

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(path=>new URL(path,self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('hadiqati-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{const response=await fetch(request);const cache=await caches.open(CACHE_NAME);cache.put(new URL('./index.html',self.registration.scope).href,response.clone());return response;}
      catch{return (await caches.match(new URL('./index.html',self.registration.scope).href))||Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(request);if(cached)return cached;
    try{const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone());}return response;}
    catch{return Response.error();}
  })());
});
