import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const pdfCacheDirectory =
  process.env.PDF_CACHE_DIR ??
  (process.env.NODE_ENV === "production"
    ? "/srv/wisdomloong/pdf-cache"
    : "/tmp/wisdomloong-pdf-cache");

const globalForPdfCache = globalThis as typeof globalThis & {
  wisdomLoongPdfDownloads?: Map<number, Promise<void>>;
};

export const activePdfDownloads =
  globalForPdfCache.wisdomLoongPdfDownloads ?? new Map<number, Promise<void>>();
globalForPdfCache.wisdomLoongPdfDownloads = activePdfDownloads;

export function pdfCachePath(articleId: number) {
  return join(pdfCacheDirectory, `${articleId}.pdf`);
}

export function arxivPdfUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || !["arxiv.org", "www.arxiv.org"].includes(parsed.hostname)) {
    return null;
  }
  const id = parsed.pathname.match(/^\/(?:abs|pdf)\/([^/]+?)(?:\.pdf)?$/)?.[1];
  return id ? `https://arxiv.org/pdf/${id}.pdf` : null;
}

function arxivPdfUrls(sourceUrl: string) {
  const primary = arxivPdfUrl(sourceUrl);
  if (!primary) return [];
  const parsed = new URL(primary);
  return [primary, `https://export.arxiv.org${parsed.pathname}`];
}

function validatePdf(buffer: Buffer, expectedLength: number) {
  if (buffer.byteLength < 1024 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("PDF source returned invalid content");
  }
  if (expectedLength > 0 && buffer.byteLength !== expectedLength) {
    throw new Error(`PDF source was truncated (${buffer.byteLength}/${expectedLength} bytes)`);
  }
  const trailer = buffer.subarray(Math.max(0, buffer.byteLength - 65_536)).toString("latin1");
  if (!trailer.includes("%%EOF")) {
    throw new Error("PDF source was truncated before its end marker");
  }
}

export async function validPdfCacheSize(articleId: number) {
  const filePath = pdfCachePath(articleId);
  try {
    const file = await stat(filePath);
    if (file.size < 1024) throw new Error("cached PDF is too small");
    const handle = await open(filePath, "r");
    try {
      const header = Buffer.alloc(5);
      await handle.read(header, 0, header.length, 0);
      const trailerLength = Math.min(65_536, file.size);
      const trailer = Buffer.alloc(trailerLength);
      await handle.read(trailer, 0, trailer.length, file.size - trailerLength);
      if (header.toString() !== "%PDF-" || !trailer.toString("latin1").includes("%%EOF")) {
        throw new Error("cached PDF is incomplete");
      }
      return file.size;
    } finally {
      await handle.close();
    }
  } catch {
    await unlink(filePath).catch(() => undefined);
    return null;
  }
}

export async function warmPdfCache(articleId: number, sourceUrl: string) {
  const remoteUrls = arxivPdfUrls(sourceUrl);
  if (remoteUrls.length === 0) return false;

  await mkdir(pdfCacheDirectory, { recursive: true });
  const filePath = pdfCachePath(articleId);
  if (await validPdfCacheSize(articleId)) return true;

  const existing = activePdfDownloads.get(articleId);
  if (existing) {
    await existing;
    return true;
  }

  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const download = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remoteUrl = remoteUrls[attempt % remoteUrls.length];
      try {
        const response = await fetch(remoteUrl, {
          cache: "no-store",
          headers: { "User-Agent": "WisdomLoong/2.0 PDF cache" },
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) throw new Error(`PDF source returned ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        validatePdf(buffer, Number(response.headers.get("content-length")) || 0);
        await writeFile(temporaryPath, buffer);
        await rename(temporaryPath, filePath);
        return;
      } catch (error) {
        lastError = error;
        await unlink(temporaryPath).catch(() => undefined);
        if (attempt < 1) {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("PDF download failed");
  })()
    .finally(() => activePdfDownloads.delete(articleId));
  activePdfDownloads.set(articleId, download);
  await download;
  return true;
}
