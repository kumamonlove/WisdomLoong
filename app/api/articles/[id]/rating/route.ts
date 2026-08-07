import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

function parseArticleId(value: string) {
  const articleId = Number(value);
  return Number.isInteger(articleId) && articleId > 0 ? articleId : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = parseArticleId((await params).id);
  const body = (await request.json().catch(() => ({}))) as { rating?: number; mustRead?: boolean };
  const rating = Number(body.rating);
  const mustRead = body.mustRead === true;
  if (!articleId) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "评分须为 1—5 星或必读" }, { status: 400 });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query<{ articleId: number; rating: number; mustRead: boolean }>(
      `INSERT INTO article_ratings (user_id, article_id, rating, must_read)
       SELECT $1, articles.id, $3, $4 FROM articles WHERE articles.id = $2
       ON CONFLICT (user_id, article_id) DO UPDATE SET
         rating = EXCLUDED.rating, must_read = EXCLUDED.must_read, updated_at = NOW()
       RETURNING article_id AS "articleId", rating, must_read AS "mustRead"`,
      [user.id, articleId, rating, mustRead],
    );
    if (saved.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    await client.query(
      `UPDATE reviews SET rating = $3, must_read = $4, updated_at = NOW()
       WHERE user_id = $1 AND article_id = $2`,
      [user.id, articleId, rating, mustRead],
    );
    const average = await client.query<{ averageRating: number }>(
      `SELECT ROUND(AVG(rating)::numeric, 1)::float AS "averageRating"
       FROM article_ratings WHERE article_id = $1`,
      [articleId],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      rating: saved.rows[0].rating,
      mustRead: saved.rows[0].mustRead,
      averageRating: average.rows[0]?.averageRating ?? saved.rows[0].rating,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Save article rating failed", error);
    return NextResponse.json({ error: "评分保存失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = parseArticleId((await params).id);
  if (!articleId) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM article_ratings WHERE user_id = $1 AND article_id = $2",
      [user.id, articleId],
    );
    await client.query(
      `UPDATE reviews SET rating = NULL, must_read = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND article_id = $2`,
      [user.id, articleId],
    );
    const average = await client.query<{ averageRating: number | null }>(
      `SELECT ROUND(AVG(rating)::numeric, 1)::float AS "averageRating"
       FROM article_ratings WHERE article_id = $1`,
      [articleId],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      rating: null,
      mustRead: false,
      averageRating: average.rows[0]?.averageRating ?? null,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Clear article rating failed", error);
    return NextResponse.json({ error: "取消评分失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
