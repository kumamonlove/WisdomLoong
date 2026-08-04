import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const result = await database.query(
    `INSERT INTO article_recent_views (user_id, article_id)
     SELECT $1, articles.id FROM articles WHERE articles.id = $2
     ON CONFLICT (user_id, article_id)
     DO UPDATE SET viewed_at = NOW()
     RETURNING article_id`,
    [user.id, articleId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
