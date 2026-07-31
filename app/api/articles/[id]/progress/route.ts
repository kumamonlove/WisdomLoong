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
  const body = (await request.json()) as { page?: number };
  const page = Math.floor(Number(body.page));
  if (!Number.isInteger(articleId) || !Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "页码不正确" }, { status: 400 });
  }
  const result = await database.query(
    `INSERT INTO reading_progress (user_id, article_id, page_number)
     SELECT $1, articles.id, $3 FROM articles WHERE articles.id = $2
     ON CONFLICT (user_id, article_id)
     DO UPDATE SET page_number = EXCLUDED.page_number, updated_at = NOW()
     RETURNING page_number`,
    [user.id, articleId, page],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, page });
}
