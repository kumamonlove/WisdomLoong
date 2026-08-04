import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  const body = (await request.json()) as { page?: number; positionY?: number };
  const page = Math.floor(Number(body.page));
  const positionY = Number(body.positionY ?? 0);
  if (
    !Number.isInteger(articleId) || !Number.isInteger(page) || page < 1 ||
    !Number.isFinite(positionY) || positionY < 0 || positionY > 100
  ) {
    return NextResponse.json({ error: "页码不正确" }, { status: 400 });
  }
  const result = await database.query(
    `INSERT INTO reading_progress (user_id, article_id, page_number, position_y)
     SELECT $1, articles.id, $3, $4 FROM articles WHERE articles.id = $2
     ON CONFLICT (user_id, article_id)
     DO UPDATE SET
       page_number = EXCLUDED.page_number,
       position_y = EXCLUDED.position_y,
       updated_at = NOW()
     RETURNING page_number, position_y`,
    [user.id, articleId, page, positionY],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, page, positionY });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  await database.query(
    "DELETE FROM reading_progress WHERE user_id = $1 AND article_id = $2",
    [user.id, articleId],
  );
  return NextResponse.json({ ok: true });
}
