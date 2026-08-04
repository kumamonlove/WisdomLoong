import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import {
  activePdfDownloads,
  arxivPdfUrl,
  pdfCacheDirectory,
  pdfCachePath,
  validPdfCacheSize,
  warmPdfCache,
} from "@/lib/pdf-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheMaxAge = 60 * 60 * 24 * 30;

type ArticleSource = { sourceUrl: string };

function cachedResponse(articleId: number, filePath: string, size: number, rangeHeader: string | null) {
  const redirectPrefix = process.env.PDF_ACCEL_REDIRECT_PREFIX;
  if (redirectPrefix) {
    return new NextResponse(null, {
      headers: {
        "Cache-Control": `private, max-age=${cacheMaxAge}, immutable`,
        "Content-Type": "application/pdf",
        "X-Accel-Redirect": `${redirectPrefix}/${articleId}.pdf`,
        "X-WisdomLoong-Cache": "HIT",
        "X-WisdomLoong-Delivery": "nginx-sendfile",
      },
    });
  }
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
  const cachedSize = await validPdfCacheSize(articleId);
  if (cachedSize) {
    return cachedResponse(articleId, filePath, cachedSize, request.headers.get("range"));
  }

  const activeDownload = activePdfDownloads.get(articleId);
  if (activeDownload) {
    try {
      await activeDownload;
      const completedSize = await validPdfCacheSize(articleId);
      if (completedSize) {
        return cachedResponse(articleId, filePath, completedSize, request.headers.get("range"));
      }
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
    await warmPdfCache(articleId, sourceUrl);
    const completedSize = await validPdfCacheSize(articleId);
    if (!completedSize) throw new Error("PDF cache validation failed");
    return cachedResponse(articleId, filePath, completedSize, request.headers.get("range"));
  } catch (error) {
    console.error("PDF proxy failed", error);
    return NextResponse.json(
      { error: "论文加载失败，请前往 arXiv 下载 PDF 后拖入阅读器" },
      { status: 502 },
    );
  }
}
