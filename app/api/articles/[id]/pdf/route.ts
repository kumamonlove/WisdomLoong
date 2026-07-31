import { createReadStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import {
  activePdfDownloads,
  arxivPdfUrl,
  pdfCacheDirectory,
  pdfCachePath,
} from "@/lib/pdf-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheMaxAge = 60 * 60 * 24 * 30;

type ArticleSource = { sourceUrl: string };

function cachedResponse(filePath: string, size: number, rangeHeader: string | null) {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
    if (start >= 0 && start <= end) {
      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": `private, max-age=${cacheMaxAge}`,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Type": "application/pdf",
          "X-WisdomLoong-Cache": "HIT",
        },
      });
    }
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": `private, max-age=${cacheMaxAge}`,
      "Content-Length": String(size),
      "Content-Type": "application/pdf",
      "X-WisdomLoong-Cache": "HIT",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  await mkdir(pdfCacheDirectory, { recursive: true });
  const filePath = pdfCachePath(articleId);
  try {
    const file = await stat(filePath);
    if (file.size > 0) {
      return cachedResponse(filePath, file.size, request.headers.get("range"));
    }
  } catch {
    // 首次访问时继续从论文源站获取。
  }

  const activeDownload = activePdfDownloads.get(articleId);
  if (activeDownload) {
    try {
      await activeDownload;
      const file = await stat(filePath);
      return cachedResponse(filePath, file.size, request.headers.get("range"));
    } catch {
      // 上一次下载失败时由本次请求重试。
    }
  }

  const result = await database.query<ArticleSource>(
    `SELECT source_url AS "sourceUrl" FROM articles WHERE id = $1`,
    [articleId],
  );
  const sourceUrl = result.rows[0]?.sourceUrl;
  const remoteUrl = sourceUrl ? arxivPdfUrl(sourceUrl) : null;
  if (!remoteUrl) {
    return NextResponse.json(
      { error: "该文章来源暂不支持站内 PDF 加速，请打开原文阅读" },
      { status: 422 },
    );
  }

  try {
    const response = await fetch(remoteUrl, {
      cache: "no-store",
      headers: { "User-Agent": "WisdomLoong/1.10 PDF cache" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error(`PDF source returned ${response.status}`);

    const [clientStream, cacheStream] = response.body.tee();
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    const cachePromise = new Response(cacheStream).arrayBuffer()
      .then(async (buffer) => {
        await writeFile(temporaryPath, Buffer.from(buffer));
        await rename(temporaryPath, filePath);
      })
      .finally(() => activePdfDownloads.delete(articleId));
    activePdfDownloads.set(articleId, cachePromise);
    void cachePromise.catch((error) => console.error("PDF cache write failed", error));

    const headers = new Headers({
      "Cache-Control": "private, max-age=3600",
      "Content-Type": "application/pdf",
      "X-WisdomLoong-Cache": "MISS",
    });
    const contentLength = response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new NextResponse(clientStream, { headers });
  } catch (error) {
    console.error("PDF proxy failed", error);
    return NextResponse.json(
      { error: "论文加载失败，请前往 arXiv 下载 PDF 后拖入阅读器" },
      { status: 502 },
    );
  }
}
