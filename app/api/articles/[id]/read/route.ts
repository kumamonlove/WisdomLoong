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

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO article_reads (user_id, article_id)
       SELECT $1, articles.id FROM articles WHERE articles.id = $2
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET read_at = NOW()
       RETURNING article_id`,
      [user.id, articleId],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    await client.query(
      "DELETE FROM reading_list WHERE user_id = $1 AND article_id = $2",
      [user.id, articleId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Mark article read failed", error);
    return NextResponse.json({ error: "标记失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
