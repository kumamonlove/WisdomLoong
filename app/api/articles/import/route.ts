import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import { articleCategories } from "@/lib/knowledge-types";

type ImportBody = {
  title?: string;
  abstract?: string;
  authors?: string[];
  publisher?: string;
  category?: string;
  publishedAt?: string;
  sourceUrl?: string;
  externalId?: string;
  addToReadingList?: boolean;
};

function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json()) as ImportBody;
  const title = body.title?.trim();
  const sourceUrl = body.sourceUrl?.trim();
  const category = articleCategories.find((item) => item === body.category);

  if (!title || !sourceUrl || !category) {
    return NextResponse.json(
      { error: "文章名、原文链接和分类不能为空" },
      { status: 400 },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "原文链接格式不正确" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "原文链接格式不正确" }, { status: 400 });
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: number }>(
      `SELECT id
       FROM articles
       WHERE title_key = $1
          OR ($2::text IS NOT NULL AND external_id = $2)
       LIMIT 1`,
      [normalizeTitle(title), body.externalId?.trim() || null],
    );

    let articleId = existing.rows[0]?.id;
    if (!articleId) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO articles (
           title, title_key, abstract, authors, publisher, category,
           published_at, source_url, external_id, imported_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          title,
          normalizeTitle(title),
          body.abstract?.trim() ?? "",
          Array.isArray(body.authors)
            ? body.authors.filter((author) => typeof author === "string").slice(0, 100)
            : [],
          body.publisher?.trim() || "arXiv",
          category,
          body.publishedAt || null,
          parsedUrl.toString(),
          body.externalId?.trim() || null,
          user.id,
        ],
      );
      articleId = inserted.rows[0].id;
    }

    if (body.addToReadingList !== false) {
      await client.query(
        `INSERT INTO reading_list (user_id, article_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, article_id) DO NOTHING`,
        [user.id, articleId],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, articleId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Article import failed", error);
    return NextResponse.json({ error: "导入失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
