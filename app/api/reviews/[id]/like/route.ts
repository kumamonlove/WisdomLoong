import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

async function reviewId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : 0;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = await reviewId(params);
  const result = await database.query(
    `INSERT INTO review_likes (user_id, review_id)
     SELECT $1, reviews.id
     FROM reviews
     INNER JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
     WHERE reviews.id = $2
       AND reviews.user_id <> $1
       AND can_users_share_content($1, reviews.user_id)
     ON CONFLICT (user_id, review_id) DO NOTHING
     RETURNING review_id`,
    [user.id, id],
  );
  if (result.rowCount === 0) {
    const review = await database.query(
      `SELECT 1 FROM reviews
       INNER JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
       WHERE reviews.id = $1 AND reviews.user_id <> $2
         AND can_users_share_content($2, reviews.user_id)`,
      [id, user.id],
    );
    if (review.rowCount === 0) {
      return NextResponse.json({ error: "只能点赞他人的读书笔记 PDF" }, { status: 400 });
    }
  }
  const count = await database.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM review_likes
     WHERE review_id = $1 AND can_users_share_content($2, user_id)`,
    [id, user.id],
  );
  return NextResponse.json({ ok: true, liked: true, count: count.rows[0].count });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = await reviewId(params);
  await database.query(
    `DELETE FROM review_likes
     WHERE user_id = $1 AND review_id = $2
       AND EXISTS (
         SELECT 1 FROM reviews
         WHERE reviews.id = $2
           AND can_users_share_content($1, reviews.user_id)
       )`,
    [user.id, id],
  );
  const count = await database.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM review_likes
     WHERE review_id = $1 AND can_users_share_content($2, user_id)`,
    [id, user.id],
  );
  return NextResponse.json({ ok: true, liked: false, count: count.rows[0].count });
}
