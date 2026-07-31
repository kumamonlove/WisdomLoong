const cacheName = "wisdomloong-papers-v1";
const pdfPath = /^\/api\/articles\/\d+\/pdf$/;

function rangeResponse(response, rangeHeader) {
  return response.arrayBuffer().then((buffer) => {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) return response;
    const start = match[1] ? Number(match[1]) : 0;
    const end = Math.min(match[2] ? Number(match[2]) : buffer.byteLength - 1, buffer.byteLength - 1);
    if (start > end) return new Response(null, { status: 416 });
    return new Response(buffer.slice(start, end + 1), {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${buffer.byteLength}`,
        "Content-Type": "application/pdf",
        "X-WisdomLoong-Device-Cache": "HIT",
      },
    });
  });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !pdfPath.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cacheKey = new Request(url.origin + url.pathname);
    const cached = await cache.match(cacheKey);
    const range = event.request.headers.get("range");
    if (cached) return range ? rangeResponse(cached, range) : cached;

    const response = await fetch(event.request);
    if (response.ok && response.status === 200) {
      event.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  })());
});
