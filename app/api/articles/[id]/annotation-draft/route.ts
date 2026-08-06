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

function sanitizeAnnotationText(value: string | undefined, maxLength: number) {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeAnnotations(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 50)
    .map((item) => {
      const annotation = item as AnnotationInput;
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
        quote: sanitizeAnnotationText(annotation.quote, 12_000),
        translation: sanitizeAnnotationText(annotation.translation, 12_000),
        content: sanitizeAnnotationText(annotation.content, 4_000),
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
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { annotations?: unknown };
    const annotations = normalizeAnnotations(body.annotations);
    const result = await database.query(
      `INSERT INTO reading_annotation_drafts (user_id, article_id, annotations)
       SELECT $1, articles.id, $3::jsonb
       FROM articles
       WHERE articles.id = $2
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET annotations = EXCLUDED.annotations, updated_at = NOW()
       RETURNING article_id`,
      [user.id, articleId, JSON.stringify(annotations)],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "文章不存在或已被移除" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, annotations });
  } catch (error) {
    console.error("Annotation draft save failed", error);
    return NextResponse.json(
      { error: "服务器暂时无法保存批注，请点击重新保存" },
      { status: 500 },
    );
  }
}
