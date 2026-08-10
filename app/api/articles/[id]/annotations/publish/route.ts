import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type AnnotationInput = {
  page?: number;
  quote?: string;
  translation?: string;
  content?: string;
  annotationKind?: "frame" | "highlight";
  highlightRects?: { x?: number; y?: number; width?: number; height?: number }[];
  rect?: { x?: number; y?: number; width?: number; height?: number } | null;
};

function text(value: string | undefined, max: number) {
  return (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function normalize(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 50).map((item) => {
    const annotation = item as AnnotationInput;
    const rect = annotation.rect;
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
    const normalizedRect = {
      x: Math.max(0, Math.min(100, Number(rect.x))),
      y: Math.max(0, Math.min(100, Number(rect.y))),
      width: Math.max(0, Math.min(100, Number(rect.width))),
      height: Math.max(0, Math.min(100, Number(rect.height))),
    };
    const content = text(annotation.content, 4_000);
    if (!content || normalizedRect.width < 1 || normalizedRect.height < 1) return null;
    const kind = annotation.annotationKind === "highlight" ? "highlight" : "frame";
    const highlightRects = kind === "highlight"
      ? (Array.isArray(annotation.highlightRects) ? annotation.highlightRects : []).slice(0, 100).map((part) => ({
          x: Math.max(0, Math.min(100, Number(part.x) || 0)),
          y: Math.max(0, Math.min(100, Number(part.y) || 0)),
          width: Math.max(0, Math.min(100, Number(part.width) || 0)),
          height: Math.max(0, Math.min(100, Number(part.height) || 0)),
        })).filter((part) => part.width > 0 && part.height > 0)
      : [];
    return {
      page: Math.max(1, Math.floor(Number(annotation.page) || 1)),
      quote: text(annotation.quote, 12_000),
      translation: text(annotation.translation, 12_000),
      content,
      kind,
      rect: normalizedRect,
      highlightRects,
    };
  }).filter((annotation): annotation is NonNullable<typeof annotation> => Boolean(annotation));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  const body = (await request.json()) as { annotations?: unknown };
  const annotations = normalize(body.annotations);
  if (annotations.length === 0) return NextResponse.json({ error: "请先添加至少一条批注" }, { status: 400 });

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const article = await client.query("SELECT 1 FROM articles WHERE id = $1", [articleId]);
    if (article.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    const existing = await client.query<{ id: number }>(
      "SELECT id FROM published_annotations WHERE user_id = $1 AND article_id = $2 ORDER BY id",
      [user.id, articleId],
    );
    for (const [index, annotation] of annotations.entries()) {
      const existingId = existing.rows[index]?.id;
      if (existingId) {
        await client.query(
          `UPDATE published_annotations SET
             page_number = $2, quote = $3, translation = $4, content = $5, annotation_kind = $6,
             rect_x = $7, rect_y = $8, rect_width = $9, rect_height = $10,
             highlight_rects = $11::jsonb, updated_at = NOW()
           WHERE id = $1`,
          [existingId, annotation.page, annotation.quote, annotation.translation, annotation.content,
            annotation.kind, annotation.rect.x, annotation.rect.y, annotation.rect.width, annotation.rect.height,
            JSON.stringify(annotation.highlightRects)],
        );
        continue;
      }
      await client.query(
        `INSERT INTO published_annotations
           (user_id, article_id, page_number, quote, translation, content, annotation_kind,
            rect_x, rect_y, rect_width, rect_height, highlight_rects)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [user.id, articleId, annotation.page, annotation.quote, annotation.translation, annotation.content,
          annotation.kind, annotation.rect.x, annotation.rect.y, annotation.rect.width, annotation.rect.height,
          JSON.stringify(annotation.highlightRects)],
      );
    }
    const obsoleteIds = existing.rows.slice(annotations.length).map((item) => item.id);
    if (obsoleteIds.length > 0) {
      await client.query("DELETE FROM published_annotations WHERE id = ANY($1::int[])", [obsoleteIds]);
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, count: annotations.length });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Publish annotations failed", error);
    return NextResponse.json({ error: "批注提交失败，请重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
