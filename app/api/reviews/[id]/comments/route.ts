import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type NoteComment = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

async function resolveReviewId(params: Promise<{ id: string }>) {
  const reviewId = Number((await params).id);
  return Number.isInteger(reviewId) && reviewId > 0 ? reviewId : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const reviewId = await resolveReviewId(params);
  if (!reviewId) return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });

  const result = await database.query<NoteComment>(
    `SELECT review_comments.id, users.username AS author, review_comments.content,
            review_comments.created_at::text AS "createdAt",
            review_comments.user_id = $2 AS "isOwn"
     FROM review_comments
     INNER JOIN users ON users.id = review_comments.user_id
     INNER JOIN reading_note_pdfs ON reading_note_pdfs.review_id = review_comments.review_id
     WHERE review_comments.review_id = $1
     ORDER BY review_comments.created_at ASC, review_comments.id ASC`,
    [reviewId, user.id],
  );
  return NextResponse.json({ comments: result.rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const reviewId = await resolveReviewId(params);
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim() ?? "";
  if (!reviewId) return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });
  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "评论须为 1—1000 个字符" }, { status: 400 });
  }

  const result = await database.query<NoteComment>(
    `INSERT INTO review_comments (review_id, user_id, content)
     SELECT reading_note_pdfs.review_id, $2, $3
     FROM reading_note_pdfs WHERE reading_note_pdfs.review_id = $1
     RETURNING id, $4::text AS author, content, created_at::text AS "createdAt", TRUE AS "isOwn"`,
    [reviewId, user.id, content, user.username],
  );
  if (result.rowCount === 0) {
    return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });
  }
  return NextResponse.json({ comment: result.rows[0] }, { status: 201 });
}
