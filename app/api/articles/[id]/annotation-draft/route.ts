import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type AnnotationInput = {
  page?: number;
  quote?: string;
  translation?: string;
  content?: string;
  rect?: { x?: number; y?: number; width?: number; height?: number } | null;
};

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
        quote: annotation.quote?.trim().slice(0, 12_000) ?? "",
        translation: annotation.translation?.trim().slice(0, 12_000) ?? "",
        content: annotation.content?.trim().slice(0, 4_000) ?? "",
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
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, annotations });
}
