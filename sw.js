// Cache simples para o app abrir rápido e funcionar sem internet (exceto a IA).
const CACHE = "ferro-v5";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  // O plano (perfil.js) depende de quem fez login: busca na rede primeiro e só usa o cache se estiver sem internet.
  if (u.pathname === "/perfil.js") {
    e.respondWith(caches.open(CACHE).then((c) => fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => c.match(e.request))));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(e.request);
      const rede = fetch(e.request).then((r) => { if (r.ok && !r.redirected) c.put(e.request, r.clone()); return r; }).catch(() => cached);
      return cached || rede;
    })
  );
});
