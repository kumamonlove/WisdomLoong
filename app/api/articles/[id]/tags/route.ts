import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import { normalizeTags } from "@/lib/knowledge-types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const articleId = Number((await params).id);
  const body = (await request.json()) as { tags?: string[] };
  const tags = normalizeTags(body.tags);
  if (!Number.isInteger(articleId) || tags.length === 0) {
    return NextResponse.json({ error: "请至少保留一个有效标签" }, { status: 400 });
  }

  const result = await database.query(
    "UPDATE articles SET tags = $1 WHERE id = $2 RETURNING id",
    [tags, articleId],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "没有找到这篇文章" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tags });
}
