const cacheName = "wisdomloong-papers-v1";
const pdfPath = /^\/api\/articles\/\d+\/pdf$/;
const queuedUrls = [];
const queuedSet = new Set();
let prefetchPromise = null;
let lastInteractiveRequest = 0;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function cacheKey(url) {
  return new Request(url.origin + url.pathname);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function validatedPdfResponse(response) {
  if (!response.ok || response.status !== 200) throw new Error(`PDF returned ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) throw new Error("PDF is too small");
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 65_536)));
  if (header !== "%PDF-" || !tail.includes("%%EOF")) throw new Error("PDF is incomplete");
  const headers = new Headers(response.headers);
  headers.set("Content-Length", String(buffer.byteLength));
  headers.set("Content-Type", "application/pdf");
  return new Response(buffer, { status: 200, headers });
}

async function storageIsAvailable() {
  if (!self.navigator.storage?.estimate) return true;
  const estimate = await self.navigator.storage.estimate();
  if (!estimate.quota || estimate.usage === undefined) return true;
  return estimate.usage / estimate.quota < 0.78;
}

async function drainPrefetchQueue() {
  const cache = await caches.open(cacheName);
  while (queuedUrls.length > 0) {
    const rawUrl = queuedUrls.shift();
    queuedSet.delete(rawUrl);
    const url = new URL(rawUrl, self.location.origin);
    const key = cacheKey(url);
    if (await cache.match(key)) continue;
    if (!(await storageIsAvailable())) break;

    const interactiveCooldown = 12_000 - (Date.now() - lastInteractiveRequest);
    if (interactiveCooldown > 0) await wait(interactiveCooldown);

    try {
      url.searchParams.set("prefetch", "1");
      const response = await fetch(url.toString(), { credentials: "same-origin" });
      await cache.put(key, await validatedPdfResponse(response));
    } catch {
      // 单篇失败不阻断后续文章；下一次打开网站时会再次尝试。
    }
    await wait(650);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREFETCH_PDFS" || !Array.isArray(event.data.urls)) return;
  for (const rawUrl of event.data.urls) {
    if (typeof rawUrl !== "string" || queuedSet.has(rawUrl)) continue;
    const url = new URL(rawUrl, self.location.origin);
    if (url.origin !== self.location.origin || !pdfPath.test(url.pathname)) continue;
    queuedSet.add(rawUrl);
    queuedUrls.push(rawUrl);
  }
  if (!prefetchPromise) {
    prefetchPromise = drainPrefetchQueue().finally(() => { prefetchPromise = null; });
  }
  event.waitUntil(prefetchPromise);
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !pdfPath.test(url.pathname)) return;

  if (!url.searchParams.has("prefetch")) lastInteractiveRequest = Date.now();

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = cacheKey(url);
    const range = event.request.headers.get("range");
    if (range) return fetch(event.request);
    if (url.searchParams.has("retry")) await cache.delete(key);
    const cached = await cache.match(key);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response.ok && response.status === 200) {
      event.waitUntil(cache.put(key, response.clone()).catch(() => undefined));
    }
    return response;
  })());
});
