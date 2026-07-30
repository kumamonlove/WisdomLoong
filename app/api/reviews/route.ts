import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type ReviewBody = {
  articleId?: number;
  rating?: number;
  content?: string;
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

  if (!Number.isInteger(articleId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !content) {
    return NextResponse.json(
      { error: "请选择文章、评分，并填写评论" },
      { status: 400 },
    );
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO reviews (user_id, article_id, rating, content)
       SELECT $1, articles.id, $3, $4
       FROM articles
       WHERE articles.id = $2
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         content = EXCLUDED.content,
         updated_at = NOW()
       RETURNING id`,
      [user.id, articleId, rating, content],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "没有找到这篇文章" }, { status: 404 });
    }
    await client.query(
      "DELETE FROM reading_list WHERE user_id = $1 AND article_id = $2",
      [user.id, articleId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Review save failed", error);
    return NextResponse.json({ error: "评论保存失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
