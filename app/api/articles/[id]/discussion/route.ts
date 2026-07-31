import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type DiscussionReview = {
  id: number;
  author: string;
  content: string;
  rating: number;
  reviewType: "short" | "long";
  mustRead: boolean;
  likeCount: number;
  likedByViewer: boolean;
  updatedAt: string;
};

type DiscussionAnnotation = {
  id: number;
  reviewId: number;
  author: string;
  page: number;
  quote: string;
  translation: string;
  content: string;
  rect: { x: number; y: number; width: number; height: number } | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const [reviews, annotations, attachments] = await Promise.all([
    database.query<DiscussionReview>(
      `SELECT
         reviews.id,
         users.username AS author,
         reviews.content,
         reviews.rating,
         reviews.review_type AS "reviewType",
         reviews.must_read AS "mustRead",
         COUNT(review_likes.user_id)::int AS "likeCount",
         BOOL_OR(review_likes.user_id = $2) AS "likedByViewer",
         reviews.updated_at::text AS "updatedAt"
       FROM reviews
       INNER JOIN users ON users.id = reviews.user_id
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       WHERE reviews.article_id = $1 AND reviews.user_id <> $2
       GROUP BY reviews.id, users.username
       ORDER BY reviews.must_read DESC, reviews.review_type DESC,
                COUNT(review_likes.user_id) DESC, reviews.updated_at DESC`,
      [articleId, user.id],
    ),
    database.query<DiscussionAnnotation>(
      `SELECT
         review_annotations.id,
         reviews.id AS "reviewId",
         users.username AS author,
         review_annotations.page_number AS page,
         review_annotations.quote,
         review_annotations.translation,
         review_annotations.content,
         CASE WHEN review_annotations.rect_x IS NULL THEN NULL ELSE JSON_BUILD_OBJECT(
           'x', review_annotations.rect_x,
           'y', review_annotations.rect_y,
           'width', review_annotations.rect_width,
           'height', review_annotations.rect_height
         ) END AS rect
       FROM review_annotations
       INNER JOIN reviews ON reviews.id = review_annotations.review_id
       INNER JOIN users ON users.id = reviews.user_id
       WHERE reviews.article_id = $1 AND reviews.user_id <> $2
       ORDER BY review_annotations.page_number, review_annotations.id`,
      [articleId, user.id],
    ),
    database.query<{ id: number; reviewId: number; note: string }>(
      `SELECT
         review_attachments.id,
         review_attachments.review_id AS "reviewId",
         review_attachments.note
       FROM review_attachments
       INNER JOIN reviews ON reviews.id = review_attachments.review_id
       WHERE reviews.article_id = $1 AND reviews.user_id <> $2
       ORDER BY review_attachments.id`,
      [articleId, user.id],
    ),
  ]);

  return NextResponse.json({
    reviews: reviews.rows.map((review) => ({
      ...review,
      likedByViewer: review.likedByViewer ?? false,
      attachments: attachments.rows.filter((item) => item.reviewId === review.id),
    })),
    annotations: annotations.rows,
  });
}
