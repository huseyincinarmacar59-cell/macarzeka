/* Macar Talimat service worker — çevrimdışı çalışma + otomatik güncelleme */
const SURUM = "macar-talimat-1.10.0";
const DOSYALAR = ["./", "index.html", "style.css", "app.js", "kilit.js", "klasor.js", "manifest.webmanifest",
  "icons/logo.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(DOSYALAR.map((d) => new Request(d, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== SURUM).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => { if (e.data === "gec") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((kayitli) =>
      kayitli || fetch(req).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error())
    )
  );
});
