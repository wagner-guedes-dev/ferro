// Cache para o app abrir sem internet. Código (HTML/JS/CSS) vem da rede primeiro, para as
// atualizações aparecerem na hora; as fotos dos exercícios ficam em cache para carregar rápido.
const CACHE = "ferro-v6";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/") || u.origin !== location.origin) return;
  const imagem = u.pathname.startsWith("/img/");
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const guardada = await c.match(e.request);
    if (imagem && guardada) return guardada;
    try {
      const r = await fetch(e.request);
      if (r.ok && !r.redirected) c.put(e.request, r.clone());
      return r;
    } catch {
      return guardada || Response.error();
    }
  }));
});
