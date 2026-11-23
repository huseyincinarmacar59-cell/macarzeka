/* Eski adresteki kurulumu kaldırıp yeni adrese yönlendirir */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const k = await caches.keys();
    await Promise.all(k.map((x) => caches.delete(x)));
    await self.registration.unregister();
    const pencereler = await self.clients.matchAll({ type: "window" });
    pencereler.forEach((p) => p.navigate(new URL("../kullanim/", self.registration.scope).href));
  })());
});
