import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

function parseArticleId(value: string) {
  const articleId = Number(value);
  return Number.isInteger(articleId) && articleId > 0 ? articleId : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = parseArticleId((await params).id);
  if (!articleId) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

  const result = await database.query<{ createdAt: string }>(
    `INSERT INTO reading_list (user_id, article_id)
     SELECT $1, articles.id FROM articles WHERE articles.id = $2
     ON CONFLICT (user_id, article_id) DO UPDATE SET created_at = reading_list.created_at
     RETURNING created_at::text AS "createdAt"`,
    [user.id, articleId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, inReadingList: true, createdAt: result.rows[0].createdAt });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = parseArticleId((await params).id);
  if (!articleId) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

  await database.query(
    "DELETE FROM reading_list WHERE user_id = $1 AND article_id = $2",
    [user.id, articleId],
  );
  return NextResponse.json({ ok: true, inReadingList: false });
}
