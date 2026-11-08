// Offline cache. Bump VERSION on every release so devices pick up the new files.
const VERSION = 'dino-ranger-v3.22.0';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/game.js', './js/world.js', './js/dinos.js', './js/rifle.js', './js/fx.js', './js/audio.js', './js/util.js', './js/convoy.js', './js/scenery.js',
  './lib/three.module.js', './lib/three.core.js', './lib/addons/loaders/GLTFLoader.js', './lib/addons/utils/BufferGeometryUtils.js', './lib/addons/utils/SkeletonUtils.js',
  './lib/addons/loaders/FBXLoader.js', './lib/addons/libs/fflate.module.js', './lib/addons/curves/NURBSCurve.js', './lib/addons/curves/NURBSUtils.js',
  './models/models.json',
  ...['start', 'boss', 'angry', 'down', 'hurt', 'weather', 'complete', 'over', 'pick', 'sleep'].map(k => './voice/' + k + '.mp3')];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(FILES);
    // 3D models listed in models/models.json (CC0 FBX/glTF/GLB) are cached too, so the game runs fully offline
    try {
      const list = await (await fetch('./models/models.json', { cache: 'no-cache' })).json();
      const extra = Object.values(list).filter(m => m && m.file).map(m => './models/' + m.file);
      if (extra.length) await c.addAll(extra);
    } catch (err) { /* no models: built-in dinosaurs are used */ }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    // anything else the game loads (e.g. a .bin next to a .gltf) is kept for offline use
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
