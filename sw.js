// Service Worker. Wichtigste Aenderung gegenueber der alten Fassung: dort stand
// eine feste Dateiliste im Cache und "cache first" — eine neue Version kam auf
// dem iPhone teils gar nicht an, weil immer die alte ausgeliefert wurde.
// Jetzt: Netz zuerst, Cache als Rueckfall. Offline funktioniert weiter,
// aber ein Update ist beim naechsten Start da.
const VERSION = "v11-2026-08-25";
const CACHE = `stunden-${VERSION}`;

const GERUEST = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/tokens.css", "./css/app.css",
  // Die Projektlisten stehen bewusst NICHT hier: sie werden nicht mehr
  // ausgeliefert, sondern aus OneDrive geholt und lokal gespeichert.
  "./vendor/xlsx.full.min.js", "./vendor/jspdf.umd.min.js",
  "./vendor/jspdf.plugin.autotable.min.js",
  "./vendor/leaflet.js", "./vendor/leaflet.css",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      // einzeln, damit eine fehlende Datei nicht die ganze Installation kippt
      .then((c) => Promise.all(GERUEST.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const anfrage = ev.request;
  if (anfrage.method !== "GET") return;

  const url = new URL(anfrage.url);
  // Anmeldung, Graph und Kartenkacheln nie zwischenspeichern
  if (url.origin !== location.origin) return;
  if (url.search.includes("code=")) return;

  ev.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage).then((treffer) => treffer || caches.match("./index.html")))
  );
});
