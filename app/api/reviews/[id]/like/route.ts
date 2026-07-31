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
     WHERE reviews.id = $2
       AND reviews.user_id <> $1
       AND reviews.review_type = 'long'
     ON CONFLICT (user_id, review_id) DO NOTHING
     RETURNING review_id`,
    [user.id, id],
  );
  if (result.rowCount === 0) {
    const review = await database.query(
      "SELECT 1 FROM reviews WHERE id = $1 AND user_id <> $2 AND review_type = 'long'",
      [id, user.id],
    );
    if (review.rowCount === 0) {
      return NextResponse.json({ error: "只能赞同他人的长评" }, { status: 400 });
    }
  }
  const count = await database.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM review_likes WHERE review_id = $1",
    [id],
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
    "DELETE FROM review_likes WHERE user_id = $1 AND review_id = $2",
    [user.id, id],
  );
  const count = await database.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM review_likes WHERE review_id = $1",
    [id],
  );
  return NextResponse.json({ ok: true, liked: false, count: count.rows[0].count });
}
