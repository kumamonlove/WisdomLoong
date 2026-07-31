import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";
import { articleCategories, normalizeTags } from "@/lib/knowledge-types";
import { pdfCacheDirectory, pdfCachePath } from "@/lib/pdf-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumPdfBytes = 50 * 1024 * 1024;

function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "无法读取上传文件" }, { status: 400 });
  }

  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const publisher = String(form.get("publisher") ?? "").trim() || "机构待补充";
  const publishedAt = String(form.get("publishedAt") ?? "").trim() || null;
  let submittedTags: unknown = [];
  try {
    submittedTags = JSON.parse(String(form.get("tags") ?? "[]"));
  } catch {
    // 后续由统一校验返回可理解的错误。
  }
  const tags = normalizeTags(submittedTags);
  const category = articleCategories.find((item) => tags.includes(item)) ?? articleCategories[0];

  if (!(file instanceof File) || !title || tags.length === 0) {
    return NextResponse.json(
      { error: "PDF、文章名称和至少一个文章标签不能为空" },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > maximumPdfBytes) {
    return NextResponse.json({ error: "PDF 需要小于 50 MB" }, { status: 413 });
  }
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    return NextResponse.json({ error: "论文日期格式不正确" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString() !== "%PDF-") {
    return NextResponse.json({ error: "文件内容不是有效的 PDF" }, { status: 400 });
  }

  const client = await database.connect();
  let temporaryPath: string | null = null;
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: number }>(
      "SELECT id FROM articles WHERE title_key = $1 LIMIT 1",
      [normalizeTitle(title)],
    );

    let articleId = existing.rows[0]?.id;
    if (!articleId) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO articles (
           title, title_key, abstract, authors, publisher, category, tags,
           published_at, source_url, external_id, imported_by
         )
         VALUES ($1, $2, '', '{}', $3, $4, $5, $6, $7, NULL, $8)
         RETURNING id`,
        [
          title,
          normalizeTitle(title),
          publisher,
          category,
          tags,
          publishedAt,
          "/api/articles/pending/pdf",
          user.id,
        ],
      );
      articleId = inserted.rows[0].id;
    } else {
      await client.query(
        `UPDATE articles
         SET title = $2,
             category = $3,
             tags = (
               SELECT ARRAY(
                 SELECT DISTINCT tag
                 FROM UNNEST(articles.tags || $4::text[]) AS tag
                 LIMIT 12
               )
             ),
             published_at = COALESCE($5::date, published_at),
             publisher = CASE WHEN $6 <> '机构待补充' THEN $6 ELSE publisher END
         WHERE id = $1`,
        [articleId, title, category, tags, publishedAt, publisher],
      );
    }

    const sourceUrl = `/api/articles/${articleId}/pdf`;
    await client.query("UPDATE articles SET source_url = $2 WHERE id = $1", [
      articleId,
      sourceUrl,
    ]);

    await mkdir(pdfCacheDirectory, { recursive: true });
    const destinationPath = pdfCachePath(articleId);
    temporaryPath = `${destinationPath}.${process.pid}.${Date.now()}.upload`;
    await writeFile(temporaryPath, buffer);
    await rename(temporaryPath, destinationPath);
    temporaryPath = null;

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, articleId });
  } catch (error) {
    await client.query("ROLLBACK");
    if (temporaryPath) {
      await unlink(temporaryPath).catch(() => undefined);
    }
    console.error("PDF upload failed", error);
    return NextResponse.json({ error: "PDF 导入失败，请稍后重试" }, { status: 500 });
  } finally {
    client.release();
  }
}
