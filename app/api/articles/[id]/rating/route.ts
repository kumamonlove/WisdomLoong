import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { rating?: number };
  const rating = Number(body.rating);
  if (!Number.isInteger(articleId) || articleId < 1) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "评分须为 1—5 星" }, { status: 400 });
  }

  const saved = await database.query<{ articleId: number; rating: number }>(
    `INSERT INTO article_ratings (user_id, article_id, rating)
     SELECT $1, articles.id, $3 FROM articles WHERE articles.id = $2
     ON CONFLICT (user_id, article_id) DO UPDATE SET
       rating = EXCLUDED.rating, updated_at = NOW()
     RETURNING article_id AS "articleId", rating`,
    [user.id, articleId, rating],
  );
  if (saved.rowCount === 0) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  const average = await database.query<{ averageRating: number }>(
    `SELECT ROUND(AVG(rating)::numeric, 1)::float AS "averageRating"
     FROM article_ratings WHERE article_id = $1`,
    [articleId],
  );
  return NextResponse.json({
    rating: saved.rows[0].rating,
    averageRating: average.rows[0]?.averageRating ?? saved.rows[0].rating,
  });
}
