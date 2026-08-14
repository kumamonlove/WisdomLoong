import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensurePdfPreview, pdfPreviewCachePath } from "@/lib/pdf-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getCurrentUser()) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId) || !await ensurePdfPreview(articleId)) {
    return NextResponse.json({ error: "论文首屏预览尚未生成" }, { status: 404 });
  }

  const filePath = pdfPreviewCachePath(articleId);
  const size = (await stat(filePath)).size;
  if (process.env.PDF_ACCEL_REDIRECT_PREFIX) {
    return new NextResponse(null, {
      headers: {
        "Cache-Control": "private, max-age=2592000, immutable",
        "Content-Type": "image/jpeg",
        "X-Accel-Redirect": `/_pdf_preview_internal/${articleId}-v2.jpg`,
      },
    });
  }
  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Cache-Control": "private, max-age=2592000, immutable",
      "Content-Length": String(size),
      "Content-Type": "image/jpeg",
    },
  });
}
