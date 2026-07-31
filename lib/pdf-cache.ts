import { mkdir, rename, stat, writeFile } from "node:fs/promises";
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

export async function warmPdfCache(articleId: number, sourceUrl: string) {
  const remoteUrl = arxivPdfUrl(sourceUrl);
  if (!remoteUrl) return false;

  await mkdir(pdfCacheDirectory, { recursive: true });
  const filePath = pdfCachePath(articleId);
  try {
    if ((await stat(filePath)).size > 1024) return true;
  } catch {
    // 缓存不存在时继续下载。
  }

  const existing = activePdfDownloads.get(articleId);
  if (existing) {
    await existing;
    return true;
  }

  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const download = fetch(remoteUrl, {
    cache: "no-store",
    headers: { "User-Agent": "WisdomLoong/1.7 PDF prewarmer" },
    signal: AbortSignal.timeout(180_000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`PDF source returned ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < 1024 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        throw new Error("PDF source returned invalid content");
      }
      await writeFile(temporaryPath, buffer);
      await rename(temporaryPath, filePath);
    })
    .finally(() => activePdfDownloads.delete(articleId));
  activePdfDownloads.set(articleId, download);
  await download;
  return true;
}
