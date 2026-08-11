import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type ReviewBody = {
  articleId?: number;
  rating?: number;
  content?: string;
  mustRead?: boolean;
  notePdf?: { dataUrl?: string; fileName?: string; source?: "generated" | "uploaded" };
  annotations?: {
    page?: number;
    quote?: string;
    translation?: string;
    content?: string;
    annotationKind?: "frame" | "highlight";
    highlightRects?: { x?: number; y?: number; width?: number; height?: number }[];
    rect?: { x?: number; y?: number; width?: number; height?: number } | null;
  }[];
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json()) as ReviewBody;
  const articleId = Number(body.articleId);
  const rating = Number(body.rating);
  const content = body.content?.trim();
  const mustRead = body.mustRead === true;

  if (!Number.isInteger(articleId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !content) {
    return NextResponse.json(
      { error: "请选择文章、评分，并填写评论" },
      { status: 400 },
    );
  }
  let parsedNotePdf: { data: Buffer; fileName: string; source: "generated" | "uploaded" } | null = null;
  if (body.notePdf?.dataUrl) {
    const match = body.notePdf.dataUrl.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return NextResponse.json({ error: "读书笔记必须是 PDF 文件" }, { status: 400 });
    const data = Buffer.from(match[1], "base64");
    if (data.byteLength > 30_000_000) {
      return NextResponse.json({ error: "读书笔记 PDF 不能超过 30 MB" }, { status: 400 });
    }
    parsedNotePdf = {
      data,
      fileName: (body.notePdf.fileName?.trim() || "读书笔记.pdf").replace(/[\r\n\\/]/g, "_").slice(0, 180),
      source: body.notePdf.source === "uploaded" ? "uploaded" : "generated",
    };
  }
  const annotations = (Array.isArray(body.annotations) ? body.annotations : [])
    .map((annotation) => {
      const rect = annotation.rect;
      const normalizedRect = rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        ? {
            x: Math.max(0, Math.min(100, Number(rect.x))),
            y: Math.max(0, Math.min(100, Number(rect.y))),
            width: Math.max(0, Math.min(100, Number(rect.width))),
            height: Math.max(0, Math.min(100, Number(rect.height))),
          }
        : null;
      return {
        page: Math.max(1, Math.floor(Number(annotation.page) || 1)),
        quote: annotation.quote?.trim().slice(0, 12_000) ?? "",
        translation: annotation.translation?.trim().slice(0, 12_000) ?? "",
        content: annotation.content?.trim().slice(0, 4_000) ?? "",
        annotationKind: annotation.annotationKind === "highlight" ? "highlight" : "frame",
        highlightRects: annotation.annotationKind === "highlight"
          ? (Array.isArray(annotation.highlightRects) ? annotation.highlightRects : []).slice(0, 100).map((item) => ({
              x: Math.max(0, Math.min(100, Number(item.x) || 0)),
              y: Math.max(0, Math.min(100, Number(item.y) || 0)),
              width: Math.max(0, Math.min(100, Number(item.width) || 0)),
              height: Math.max(0, Math.min(100, Number(item.height) || 0)),
            })).filter((item) => item.width > 0 && item.height > 0)
          : [],
        rect: normalizedRect && normalizedRect.width >= 1 && normalizedRect.height >= 1
          ? normalizedRect
          : null,
      };
    })
    .filter((annotation) => annotation.content && annotation.rect);

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: number }>(
      `INSERT INTO reviews (user_id, article_id, rating, content, review_type, must_read)
       SELECT $1, articles.id, $3, $4, $5, $6
       FROM articles
       WHERE articles.id = $2
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         content = EXCLUDED.content,
         review_type = EXCLUDED.review_type,
         must_read = EXCLUDED.must_read,
         updated_at = NOW()
       RETURNING id`,
      [user.id, articleId, rating, content, "long", mustRead],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "没有找到这篇文章" }, { status: 404 });
    }
    const reviewId = result.rows[0].id;
    await client.query(
      `INSERT INTO article_ratings (user_id, article_id, rating, must_read)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, article_id) DO UPDATE SET
         rating = EXCLUDED.rating, must_read = EXCLUDED.must_read, updated_at = NOW()`,
      [user.id, articleId, rating, mustRead],
    );
    if (!parsedNotePdf) {
      const existingNote = await client.query("SELECT 1 FROM reading_note_pdfs WHERE review_id = $1", [reviewId]);
      if (existingNote.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "请生成读书笔记 PDF，或上传自己的 PDF" },
          { status: 400 },
        );
      }
    }
    if (parsedNotePdf) {
      await client.query(
        `INSERT INTO reading_note_pdfs (review_id, file_name, source, pdf_data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (review_id) DO UPDATE SET
           file_name = EXCLUDED.file_name,
           source = EXCLUDED.source,
           pdf_data = EXCLUDED.pdf_data,
           updated_at = NOW()`,
        [reviewId, parsedNotePdf.fileName, parsedNotePdf.source, parsedNotePdf.data],
      );
    }
    const existingAnnotations = await client.query<{ id: number }>(
      "SELECT id FROM review_annotations WHERE review_id = $1 ORDER BY id",
      [reviewId],
    );
    for (const [index, annotation] of annotations.entries()) {
      const existingId = existingAnnotations.rows[index]?.id;
      if (existingId) {
        await client.query(
          `UPDATE review_annotations SET
             page_number = $2, quote = $3, translation = $4, content = $5,
             rect_x = $6, rect_y = $7, rect_width = $8, rect_height = $9,
             annotation_kind = $10, highlight_rects = $11::jsonb
           WHERE id = $1`,
          [existingId, annotation.page, annotation.quote, annotation.translation, annotation.content,
            annotation.rect?.x ?? null, annotation.rect?.y ?? null, annotation.rect?.width ?? null,
            annotation.rect?.height ?? null, annotation.annotationKind, JSON.stringify(annotation.highlightRects)],
        );
        continue;
      }
      await client.query(
        `INSERT INTO review_annotations
           (review_id, page_number, quote, translation, content,
            rect_x, rect_y, rect_width, rect_height, annotation_kind, highlight_rects)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
          reviewId,
          annotation.page,
          annotation.quote,
          annotation.translation,
          annotation.content,
          annotation.rect?.x ?? null,
          annotation.rect?.y ?? null,
          annotation.rect?.width ?? null,
          annotation.rect?.height ?? null,
          annotation.annotationKind,
          JSON.stringify(annotation.highlightRects),
        ],
      );
    }
    const obsoleteAnnotationIds = existingAnnotations.rows.slice(annotations.length).map((item) => item.id);
    if (obsoleteAnnotationIds.length > 0) {
      await client.query("DELETE FROM review_annotations WHERE id = ANY($1::int[])", [obsoleteAnnotationIds]);
    }
    await client.query(
      "DELETE FROM reading_annotation_drafts WHERE user_id = $1 AND article_id = $2",
      [user.id, articleId],
    );
    const readResult = await client.query<{ readAt: string }>(
      `INSERT INTO article_reads (user_id, article_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET read_at = NOW()
       RETURNING read_at::text AS "readAt"`,
      [user.id, articleId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, reviewId, hasNotePdf: true, readAt: readResult.rows[0].readAt });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Review save failed", error);
    return NextResponse.json({ error: "评论保存失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
