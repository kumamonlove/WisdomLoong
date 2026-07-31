import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type ReviewBody = {
  articleId?: number;
  rating?: number;
  content?: string;
  reviewType?: "short" | "long";
  mustRead?: boolean;
  attachments?: { dataUrl?: string; note?: string }[];
  annotations?: {
    page?: number;
    quote?: string;
    translation?: string;
    content?: string;
  }[];
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
  const reviewType = body.reviewType === "short" ? "short" : "long";
  const mustRead = body.mustRead === true;

  if (!Number.isInteger(articleId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !content) {
    return NextResponse.json(
      { error: "请选择文章、评分，并填写评论" },
      { status: 400 },
    );
  }
  if ((reviewType === "short" && content.length > 80) || (reviewType === "long" && content.length < 80)) {
    return NextResponse.json(
      { error: reviewType === "short" ? "短评不能超过 80 字" : "长评至少需要 80 字" },
      { status: 400 },
    );
  }

  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : [];
  const parsedAttachments: { contentType: string; data: Buffer; note: string }[] = [];
  for (const attachment of attachments) {
    const match = attachment.dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) continue;
    const data = Buffer.from(match[2], "base64");
    if (data.byteLength > 2_500_000) {
      return NextResponse.json({ error: "单张截图不能超过 2.5 MB" }, { status: 400 });
    }
    parsedAttachments.push({
      contentType: match[1],
      data,
      note: attachment.note?.trim().slice(0, 200) ?? "",
    });
  }
  const annotations = (Array.isArray(body.annotations) ? body.annotations : [])
    .slice(0, 50)
    .map((annotation) => ({
      page: Math.max(1, Math.floor(Number(annotation.page) || 1)),
      quote: annotation.quote?.trim().slice(0, 12_000) ?? "",
      translation: annotation.translation?.trim().slice(0, 12_000) ?? "",
      content: annotation.content?.trim().slice(0, 4_000) ?? "",
    }))
    .filter((annotation) => annotation.content);

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: number }>(
      `INSERT INTO reviews (user_id, article_id, rating, content, review_type, must_read)
       SELECT $1, articles.id, $3, $4, $5, $6
       FROM articles
       WHERE articles.id = $2
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         content = EXCLUDED.content,
         review_type = EXCLUDED.review_type,
         must_read = EXCLUDED.must_read,
         updated_at = NOW()
       RETURNING id`,
      [user.id, articleId, rating, content, reviewType, mustRead],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "没有找到这篇文章" }, { status: 404 });
    }
    const reviewId = result.rows[0].id;
    await client.query("DELETE FROM review_attachments WHERE review_id = $1", [reviewId]);
    for (const attachment of parsedAttachments) {
      await client.query(
        `INSERT INTO review_attachments (review_id, content_type, image_data, note)
         VALUES ($1, $2, $3, $4)`,
        [reviewId, attachment.contentType, attachment.data, attachment.note],
      );
    }
    await client.query("DELETE FROM review_annotations WHERE review_id = $1", [reviewId]);
    for (const annotation of annotations) {
      await client.query(
        `INSERT INTO review_annotations
           (review_id, page_number, quote, translation, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [reviewId, annotation.page, annotation.quote, annotation.translation, annotation.content],
      );
    }
    await client.query(
      "DELETE FROM reading_list WHERE user_id = $1 AND article_id = $2",
      [user.id, articleId],
    );
    await client.query(
      `INSERT INTO article_reads (user_id, article_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, article_id)
       DO UPDATE SET read_at = NOW()`,
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
