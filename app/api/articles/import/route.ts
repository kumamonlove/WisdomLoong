import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { translateAcademicText } from "@/lib/academic-translation";
import { database } from "@/lib/db";
import { articleCategories, normalizeTags } from "@/lib/knowledge-types";
import { warmPdfCache } from "@/lib/pdf-cache";

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
  tags?: string[];
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
  const tags = normalizeTags(body.tags);
  const category = articleCategories.find((item) => tags.includes(item)) ?? articleCategories[0];
  const publisher =
    body.publisher?.trim() && body.publisher.trim().toLocaleLowerCase() !== "arxiv"
      ? body.publisher.trim()
      : "机构待补充";
  const abstract = body.abstract?.trim().slice(0, 12_000) ?? "";

  if (!title || !sourceUrl || tags.length === 0) {
    return NextResponse.json(
      { error: "文章名、原文链接和至少一个文章标签不能为空" },
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

  let abstractZh = "";
  let abstractTranslationError = "";
  if (abstract) {
    try {
      abstractZh = await translateAcademicText(abstract);
    } catch (error) {
      abstractTranslationError = error instanceof Error ? error.message : String(error);
      console.warn("Imported article abstract translation failed", error);
    }
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
           title, title_key, abstract, abstract_zh, authors, publisher, category, tags,
           published_at, source_url, external_id, imported_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          title,
          normalizeTitle(title),
          abstract,
          abstractZh,
          Array.isArray(body.authors)
            ? body.authors.filter((author) => typeof author === "string").slice(0, 100)
            : [],
          publisher,
          category,
          tags,
          body.publishedAt || null,
          parsedUrl.toString(),
          body.externalId?.trim() || null,
          user.id,
        ],
      );
      articleId = inserted.rows[0].id;
    } else {
      await client.query(
        `UPDATE articles
         SET publisher = CASE
               WHEN $2 <> '机构待补充' THEN $2
               WHEN LOWER(publisher) = 'arxiv' THEN '机构待补充'
               ELSE publisher
             END,
             abstract = CASE WHEN $4 <> '' THEN $4 ELSE abstract END,
             abstract_zh = CASE WHEN $5 <> '' THEN $5 ELSE abstract_zh END,
             abstract_translation_attempts = CASE WHEN $5 <> '' THEN 0 ELSE abstract_translation_attempts END,
             abstract_translation_next_attempt_at = CASE WHEN $5 <> '' THEN NULL ELSE abstract_translation_next_attempt_at END,
             abstract_translation_last_error = CASE WHEN $5 <> '' THEN '' ELSE abstract_translation_last_error END,
             tags = (
               SELECT ARRAY(
                 SELECT DISTINCT tag
                 FROM UNNEST(articles.tags || $3::text[]) AS tag
                 LIMIT 12
               )
             )
         WHERE id = $1`,
        [articleId, publisher, tags, abstract, abstractZh],
      );
    }

    if (abstract && !abstractZh) {
      await client.query(
        `UPDATE articles
         SET abstract_translation_attempts = abstract_translation_attempts + 1,
             abstract_translation_next_attempt_at = NOW() + CASE abstract_translation_attempts
               WHEN 0 THEN INTERVAL '15 minutes'
               WHEN 1 THEN INTERVAL '30 minutes'
               WHEN 2 THEN INTERVAL '60 minutes'
               WHEN 3 THEN INTERVAL '120 minutes'
               ELSE INTERVAL '360 minutes'
             END,
             abstract_translation_last_error = $2
         WHERE id = $1
           AND abstract_zh = ''`,
        [articleId, abstractTranslationError.slice(0, 1_000)],
      );
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
    void warmPdfCache(articleId, parsedUrl.toString()).catch((error) =>
      console.error("Imported PDF prewarm failed", error),
    );
    return NextResponse.json({
      ok: true,
      articleId,
      abstractExtracted: Boolean(abstract),
      abstractTranslated: Boolean(abstractZh),
      abstractZh,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Article import failed", error);
    return NextResponse.json({ error: "导入失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
