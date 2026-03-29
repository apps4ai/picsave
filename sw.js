const CACHE = 'picsave-v1';
const ASSETS = ['/', '/index.html', '/manifest.json', '/sw.js'];
const GAS_URL = "https://script.google.com/macros/s/AKfycbx5eodBgtj_OvMThQX9-Uc0CIk6DPMmHXXjrJQJsfR4Z47NS8rLU-HZN0AVDmJoZpIq/exec";

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cached =>
            cached || fetch(e.request).catch(() => new Response('Offline', { status: 503 }))
        )
    );
});

self.addEventListener('sync', e => {
    if (e.tag === 'send-photos') e.waitUntil(runQueue());
});

async function openDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open("picsave_db", 2);
        r.onsuccess = () => res(r.result);
        r.onerror   = () => rej(r.error);
        r.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains("send_queue"))
                d.createObjectStore("send_queue", { keyPath: "id" });
        };
    });
}

async function runQueue() {
    const db = await openDB();
    const items = await new Promise((res, rej) => {
        const req = db.transaction("send_queue","readonly").objectStore("send_queue").getAll();
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
    });
    for (const item of items) {
        try {
            await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: item.payload });
            await new Promise((res, rej) => {
                const req = db.transaction("send_queue","readwrite").objectStore("send_queue").delete(item.id);
                req.onsuccess = res; req.onerror = rej;
            });
        } catch {
            await ping('SEND_ERROR'); return;
        }
    }
    await ping('SEND_COMPLETE');
}

async function ping(type) {
    const all = await self.clients.matchAll({ includeUncontrolled: true });
    all.forEach(c => c.postMessage({ type }));
}
