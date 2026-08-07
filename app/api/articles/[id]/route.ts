import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId) || articleId < 1) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const article = await client.query(
      "SELECT id FROM articles WHERE id = $1 FOR UPDATE",
      [articleId],
    );
    if (article.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    const protectedContent = await client.query(
      `SELECT EXISTS (SELECT 1 FROM reviews WHERE article_id = $1) AS blocked`,
      [articleId],
    );
    if (protectedContent.rows[0]?.blocked) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "这篇文章已有评论或读书笔记，不能删除" },
        { status: 409 },
      );
    }
    await client.query("DELETE FROM articles WHERE id = $1", [articleId]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete article failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
