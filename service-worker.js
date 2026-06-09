const CACHE="bramley-rtt-spec-terminal-v1";
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.json","./icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("fetch",e=>{if(e.request.url.includes("/data/")) return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
