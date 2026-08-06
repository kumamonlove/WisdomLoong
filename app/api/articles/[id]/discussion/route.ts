import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type DiscussionReview = {
  id: number;
  author: string;
  content: string;
  rating: number;
  reviewType: "long";
  mustRead: boolean;
  likeCount: number;
  likedByViewer: boolean;
  isOwn: boolean;
  readCount: number;
  annotationCount: number;
  noteFileName: string | null;
  noteSource: "generated" | "uploaded" | null;
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
  annotationKind: "frame" | "highlight";
  highlightRects: { x: number; y: number; width: number; height: number }[];
  rect: { x: number; y: number; width: number; height: number } | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const articleId = Number((await params).id);
  if (!Number.isInteger(articleId)) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  const includeAnnotations = new URL(request.url).searchParams.get("includeAnnotations") === "1";

  const annotationsQuery = includeAnnotations
    ? database.query<DiscussionAnnotation>(
        `SELECT * FROM (
           SELECT
             review_annotations.id,
             reviews.id AS "reviewId",
             users.username AS author,
             review_annotations.page_number AS page,
             review_annotations.quote,
             review_annotations.translation,
             review_annotations.content,
             review_annotations.annotation_kind AS "annotationKind",
             review_annotations.highlight_rects AS "highlightRects",
             JSON_BUILD_OBJECT(
               'x', review_annotations.rect_x, 'y', review_annotations.rect_y,
               'width', review_annotations.rect_width, 'height', review_annotations.rect_height
             ) AS rect
           FROM review_annotations
           INNER JOIN reviews ON reviews.id = review_annotations.review_id
           INNER JOIN users ON users.id = reviews.user_id
           WHERE reviews.article_id = $1 AND reviews.user_id <> $2
             AND review_annotations.rect_x IS NOT NULL
             AND review_annotations.rect_y IS NOT NULL
             AND review_annotations.rect_width IS NOT NULL
             AND review_annotations.rect_height IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM published_annotations
               WHERE published_annotations.article_id = reviews.article_id
                 AND published_annotations.user_id = reviews.user_id
             )
           UNION ALL
           SELECT
             -published_annotations.id AS id,
             0 AS "reviewId",
             users.username AS author,
             published_annotations.page_number AS page,
             published_annotations.quote,
             published_annotations.translation,
             published_annotations.content,
             published_annotations.annotation_kind AS "annotationKind",
             published_annotations.highlight_rects AS "highlightRects",
             JSON_BUILD_OBJECT(
               'x', published_annotations.rect_x, 'y', published_annotations.rect_y,
               'width', published_annotations.rect_width, 'height', published_annotations.rect_height
             ) AS rect
           FROM published_annotations
           INNER JOIN users ON users.id = published_annotations.user_id
           WHERE published_annotations.article_id = $1 AND published_annotations.user_id <> $2
         ) annotations
         ORDER BY page, id`,
        [articleId, user.id],
      )
    : Promise.resolve({ rows: [] as DiscussionAnnotation[] });

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
         reviews.user_id = $2 AS "isOwn",
         (SELECT COUNT(*)::int FROM reading_note_reads WHERE reading_note_reads.review_id = reviews.id) AS "readCount",
         CASE WHEN EXISTS (
           SELECT 1 FROM published_annotations
           WHERE published_annotations.user_id = reviews.user_id
             AND published_annotations.article_id = reviews.article_id
         ) THEN (
           SELECT COUNT(*)::int FROM published_annotations
           WHERE published_annotations.user_id = reviews.user_id
             AND published_annotations.article_id = reviews.article_id
         ) ELSE (
           SELECT COUNT(*)::int FROM review_annotations WHERE review_annotations.review_id = reviews.id
         ) END AS "annotationCount",
         reading_note_pdfs.file_name AS "noteFileName",
         reading_note_pdfs.source AS "noteSource",
         reviews.updated_at::text AS "updatedAt"
       FROM reviews
       INNER JOIN users ON users.id = reviews.user_id
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       LEFT JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
       WHERE reviews.article_id = $1
       GROUP BY reviews.id, users.username, reading_note_pdfs.file_name, reading_note_pdfs.source
       ORDER BY reviews.must_read DESC, reviews.review_type DESC,
                COUNT(review_likes.user_id) DESC, reviews.updated_at DESC`,
      [articleId, user.id],
    ),
    annotationsQuery,
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
