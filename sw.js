// Cache simples para o app abrir rápido e funcionar sem internet (exceto a IA).
const CACHE = "ferro-v4";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(e.request);
      const rede = fetch(e.request).then((r) => { if (r.ok && !r.redirected) c.put(e.request, r.clone()); return r; }).catch(() => cached);
      return cached || rede;
    })
  );
});
