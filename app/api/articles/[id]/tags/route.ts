import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import { normalizeTags } from "@/lib/knowledge-types";
import { refreshKnowledgeGraphForArticle } from "@/lib/knowledge-graph";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const articleId = Number((await params).id);
  const body = (await request.json()) as { tags?: string[]; publisher?: string; publishedAt?: string | null };
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  let result;
  let response: { ok: true; tags?: string[]; publisher?: string; publishedAt?: string | null };
  if (Array.isArray(body.tags)) {
    const tags = normalizeTags(body.tags);
    if (tags.length === 0) {
      return NextResponse.json({ error: "请至少保留一个有效标签" }, { status: 400 });
    }
    result = await database.query(
      "UPDATE articles SET tags = $1 WHERE id = $2 RETURNING id",
      [tags, articleId],
    );
    response = { ok: true, tags };
  } else if (typeof body.publisher === "string") {
    const publisher = body.publisher?.trim();
    if (!publisher || publisher.length > 180 || publisher.toLocaleLowerCase() === "arxiv") {
      return NextResponse.json({ error: "请填写有效的真实发布机构" }, { status: 400 });
    }
    result = await database.query(
      "UPDATE articles SET publisher = $1 WHERE id = $2 RETURNING id",
      [publisher, articleId],
    );
    response = { ok: true, publisher };
  } else if ("publishedAt" in body) {
    const publishedAt = body.publishedAt?.trim() || null;
    const parsedDate = publishedAt ? new Date(`${publishedAt}T00:00:00Z`) : null;
    if (publishedAt && (
      !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ||
      !parsedDate ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== publishedAt
    )) {
      return NextResponse.json({ error: "请填写有效的发布日期" }, { status: 400 });
    }
    result = await database.query(
      "UPDATE articles SET published_at = $1 WHERE id = $2 RETURNING id",
      [publishedAt, articleId],
    );
    response = { ok: true, publishedAt };
  } else {
    return NextResponse.json({ error: "没有可保存的文章信息" }, { status: 400 });
  }
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "没有找到这篇文章" }, { status: 404 });
  }
  void refreshKnowledgeGraphForArticle(articleId).catch((error) =>
    console.error("Article metadata graph refresh failed", error),
  );
  return NextResponse.json(response);
}
