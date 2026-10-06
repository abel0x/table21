/* Service worker — caches the static shell for full offline play.
   Only used when the game is served over http(s); on file:// it is skipped. */
var CACHE_VERSION = "vbj-v27";
var APP_ROOT = new URL("./", self.location.href || self.location.origin + "/");
var CACHE_PREFIX = "vbj-" + encodeURIComponent(APP_ROOT.pathname) + "-";
var CACHE = CACHE_PREFIX + CACHE_VERSION.slice(4);
var ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/i18n.js",
  "./js/sound.js",
  "./js/engine.js",
  "./js/rules.js",
  "./js/chip-stack.js",
  "./js/game.js",
  "./js/pwa.js",
  "./manifest.json",
  "./icon.svg",
  "./assets/fonts/table21-sans-regular.woff2",
  "./assets/fonts/table21-sans-semibold.woff2",
  "./assets/audio/card-slide-1.ogg",
  "./assets/audio/card-slide-2.ogg",
  "./assets/audio/card-flip.ogg",
  "./assets/audio/chip-click-1.ogg",
  "./assets/audio/chip-click-2.ogg",
  "./assets/audio/chip-stack.ogg",
  "./assets/audio/chips-push.ogg",
  "./assets/audio/shuffle.ogg"
];

self.addEventListener("install", function (e) {
  // Older application versions may reload unconditionally on controllerchange.
  // Never force an update onto those pages while a hand is still in progress.
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "TABLE21_ACTIVATE" || !e.source) return;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
    var tables = clients.filter(function (client) { return client.url.indexOf(APP_ROOT.href) === 0; });
    // Only the compatible page that declared itself idle can activate us. With
    // multiple tabs, wait for them to close instead of interrupting another hand.
    if (tables.length === 1 && tables[0].id === e.source.id) return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  function cachedResponse(request) {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request);
    }).catch(function () { return undefined; });
  }
  function offlineResponse() {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }

  e.respondWith(
    cachedResponse(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          return caches.open(CACHE).then(function (cache) {
            return cache.put(e.request, copy);
          }).catch(function () {
            // A full or unavailable cache must not discard a successful fetch.
          }).then(function () { return res; });
        }
        return res;
      }).catch(function () {
        // Navigations still land on the cached app shell when the device is offline.
        if (e.request.mode === "navigate") {
          return cachedResponse(new URL("index.html", APP_ROOT).href).then(function (shell) {
            return shell || offlineResponse();
          });
        }
        return offlineResponse();
      });
    })
  );
});
