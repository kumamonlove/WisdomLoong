import { database } from "@/lib/db";
import {
  type ArticleCategory,
  type Category,
  type ReviewFilter,
  type SortOrder,
} from "@/lib/knowledge-types";

export {
  articleCategories,
  type ArticleCategory,
  type Category,
  type ReviewFilter,
  type SortOrder,
} from "@/lib/knowledge-types";

export type ArticleCardData = {
  id: number;
  isRead?: boolean;
  title: string;
  category: ArticleCategory;
  tags: string[];
  publisher: string;
  publishedAt: string | null;
  sourceUrl: string;
  authors: string[];
  reviewAuthor: string | null;
  reviewContent: string | null;
  reviewId?: number | null;
  reviewAnnotationCount?: number;
  activityAuthors?: string[];
  activityCount?: number;
  activityAt?: string;
  noteLikeCount?: number;
  noteReadCount?: number;
  noteCommentCount?: number;
  rating: number | null;
  mustRead?: boolean;
  reviews?: {
    id: number;
    author: string;
    content: string;
    rating: number | null;
    reviewType: "long";
    mustRead: boolean;
    likeCount: number;
    likedByViewer: boolean;
    noteFileName: string | null;
    updatedAt: string;
    attachments: { id: number; note: string }[];
    annotations: {
      id: number;
      page: number;
      quote: string;
      translation: string;
      content: string;
      annotationKind?: "frame" | "highlight";
      highlightRects?: { x: number; y: number; width: number; height: number }[];
      rect?: { x: number; y: number; width: number; height: number } | null;
    }[];
  }[];
  recommendationSignals?: {
    readCount: number;
    longReviewCount: number;
    mustReadCount: number;
    likeCount: number;
  };
};

export type ReaderArticle = {
  id: number;
  title: string;
  abstract: string;
  abstractZh: string;
  authors: string[];
  publisher: string;
  category: ArticleCategory;
  tags: string[];
  publishedAt: string | null;
  sourceUrl: string;
  lastReadPage: number | null;
  lastReadPositionY: number | null;
  lastReadPositionX: number | null;
  isRead: boolean;
  inReadingList: boolean;
  readingListAddedAt?: string | null;
  ownRating?: number | null;
  ownMustRead?: boolean;
  readingStatus: "read" | "reading" | "unread";
  canDelete: boolean;
  readingActivityAt?: string | null;
  rating?: number | null;
  readCount?: number;
  readingNowCount?: number;
  savedAnnotations: {
    page: number;
    quote: string;
    translation: string;
    content: string;
    annotationKind?: "frame" | "highlight";
    highlightRects?: { x: number; y: number; width: number; height: number }[];
    rect?: { x: number; y: number; width: number; height: number } | null;
  }[];
  ownReview: {
    id: number;
    rating: number | null;
    content: string;
    reviewType: "long";
    mustRead: boolean;
    noteFileName: string | null;
    noteSource: "generated" | "uploaded" | null;
    annotations: {
      page: number;
      quote: string;
      translation: string;
      content: string;
      annotationKind?: "frame" | "highlight";
      highlightRects?: { x: number; y: number; width: number; height: number }[];
      rect?: { x: number; y: number; width: number; height: number } | null;
    }[];
  } | null;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCategory(
  value: string | string[] | undefined,
): Category {
  const selected = firstValue(value)?.trim();
  return selected && selected.length <= 24 ? selected : "全部";
}

export function parseSort(value: string | string[] | undefined): SortOrder {
  const selected = firstValue(value);
  if (selected === "oldest" || selected === "rating") {
    return selected;
  }
  return "newest";
}

export function parseReviewFilter(
  value: string | string[] | undefined,
): ReviewFilter {
  const selected = firstValue(value);
  if (selected === "reviewed" || selected === "unreviewed") {
    return selected;
  }
  return "all";
}

export async function getFeaturedNoteArticles() {
  const result = await database.query<ArticleCardData>(
    `SELECT
       articles.id,
       articles.title,
       articles.category,
       articles.tags,
       articles.publisher,
       articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl",
       articles.authors,
       users.username AS "reviewAuthor",
       reviews.content AS "reviewContent",
       reviews.id AS "reviewId",
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
       ) END AS "reviewAnnotationCount",
       reviews.rating,
       reviews.must_read AS "mustRead",
       reviews.updated_at::text AS "activityAt",
       (SELECT COUNT(*)::int FROM review_likes WHERE review_likes.review_id = reviews.id) AS "noteLikeCount",
       (SELECT COUNT(*)::int FROM reading_note_reads WHERE reading_note_reads.review_id = reviews.id) AS "noteReadCount",
       (SELECT COUNT(*)::int FROM review_comments WHERE review_comments.review_id = reviews.id) AS "noteCommentCount"
     FROM reviews
     INNER JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
     INNER JOIN articles ON articles.id = reviews.article_id
     INNER JOIN users ON users.id = reviews.user_id
     ORDER BY reviews.updated_at DESC, reviews.id DESC`,
  );

  return result.rows;
}

export async function getAnnotatedReadingArticles() {
  const result = await database.query<ArticleCardData>(
    `WITH annotation_activity AS (
       SELECT article_id, user_id, MAX(updated_at) AS activity_at
       FROM published_annotations
       GROUP BY article_id, user_id
     )
     SELECT
       articles.id, articles.title, articles.category, articles.tags,
       articles.publisher, articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl", articles.authors,
       NULL::text AS "reviewAuthor", NULL::text AS "reviewContent",
       NULL::float AS rating,
       ARRAY_AGG(users.username ORDER BY annotation_activity.activity_at DESC) AS "activityAuthors",
       COUNT(*)::int AS "activityCount",
       MAX(annotation_activity.activity_at)::text AS "activityAt"
     FROM annotation_activity
     INNER JOIN articles ON articles.id = annotation_activity.article_id
     INNER JOIN users ON users.id = annotation_activity.user_id
     GROUP BY articles.id
     ORDER BY MAX(annotation_activity.activity_at) DESC, articles.id DESC`,
  );
  return result.rows;
}

export async function getRecentlyReadArticles(userId: number) {
  const result = await database.query<ArticleCardData>(
    `SELECT
       articles.id,
       articles.title,
       articles.category,
       articles.tags,
       articles.publisher,
       articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl",
       articles.authors,
       NULL::text AS "reviewAuthor",
       NULL::text AS "reviewContent",
       review_stats.average_rating AS rating,
       review_stats.must_read AS "mustRead",
       EXISTS (
         SELECT 1 FROM article_reads
         WHERE article_reads.user_id = $1
           AND article_reads.article_id = articles.id
       ) AS "isRead"
     FROM article_recent_views
     INNER JOIN articles ON articles.id = article_recent_views.article_id
     LEFT JOIN LATERAL (
       SELECT
         ROUND(AVG(reviews.rating)::numeric, 1)::float AS average_rating,
         BOOL_OR(reviews.must_read) AS must_read
       FROM reviews
       WHERE reviews.article_id = articles.id
     ) review_stats ON TRUE
     WHERE article_recent_views.user_id = $1
     ORDER BY article_recent_views.viewed_at DESC
     LIMIT 4`,
    [userId],
  );

  return result.rows;
}

export async function getCategoryArticles({
  userId,
  category,
  reviewFilter,
  sort,
}: {
  userId: number;
  category: Category;
  reviewFilter: ReviewFilter;
  sort: SortOrder;
}) {
  const conditions = [
    `($1::text = '全部' OR articles.category = $1 OR $1 = ANY(articles.tags))`,
    `(
      $2::text = 'all'
      OR ($2 = 'reviewed' AND own_review.id IS NOT NULL)
      OR ($2 = 'unreviewed' AND own_review.id IS NULL)
    )`,
  ];
  const orderBy =
    sort === "oldest"
      ? "articles.published_at ASC NULLS LAST, articles.created_at ASC"
      : sort === "rating"
        ? "COALESCE(review_stats.average_rating, 0) DESC, articles.published_at DESC NULLS LAST"
        : "articles.published_at DESC NULLS LAST, articles.created_at DESC";

  const result = await database.query<ArticleCardData>(
    `SELECT
       articles.id,
       articles.title,
       articles.category,
       articles.tags,
       articles.publisher,
       articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl",
       articles.authors,
       latest_reviewer.username AS "reviewAuthor",
       latest_review.content AS "reviewContent",
       review_stats.average_rating AS rating,
       review_stats.must_read AS "mustRead"
     FROM articles
     LEFT JOIN reviews own_review
       ON own_review.article_id = articles.id AND own_review.user_id = $3
     LEFT JOIN LATERAL (
       SELECT reviews.user_id, reviews.content
       FROM reviews
       WHERE reviews.article_id = articles.id
       ORDER BY reviews.updated_at DESC
       LIMIT 1
     ) latest_review ON TRUE
     LEFT JOIN users latest_reviewer ON latest_reviewer.id = latest_review.user_id
     LEFT JOIN LATERAL (
       SELECT
         ROUND(AVG(reviews.rating)::numeric, 1)::float AS average_rating,
         BOOL_OR(reviews.must_read) AS must_read
       FROM reviews
       WHERE reviews.article_id = articles.id
     ) review_stats ON TRUE
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}`,
    [category, reviewFilter, userId],
  );

  return result.rows;
}

export async function getCategoryCounts() {
  const result = await database.query<{ category: string; count: number }>(
    `SELECT category, count
     FROM (
       SELECT '全部'::text AS category, COUNT(*)::int AS count, 0 AS position
       FROM articles
       UNION ALL
       SELECT tag AS category, COUNT(DISTINCT articles.id)::int AS count, 1 AS position
       FROM articles
       CROSS JOIN LATERAL UNNEST(
         CASE WHEN CARDINALITY(articles.tags) > 0 THEN articles.tags ELSE ARRAY[articles.category] END
       ) AS tag
       GROUP BY tag
     ) counts
     ORDER BY position, count DESC, category`,
  );
  return new Map(result.rows.map((row) => [row.category, row.count]));
}

export async function getReadingList(userId: number) {
  const result = await database.query<ArticleCardData>(
    `SELECT
       articles.id,
       articles.title,
       articles.category,
       articles.tags,
       articles.publisher,
       articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl",
       articles.authors,
       latest_reviewer.username AS "reviewAuthor",
       latest_review.content AS "reviewContent",
       latest_review.rating,
       EXISTS (
         SELECT 1 FROM article_reads
         WHERE article_reads.user_id = $1
           AND article_reads.article_id = articles.id
       ) AS "isRead",
       EXISTS (
         SELECT 1 FROM reviews
         WHERE reviews.article_id = articles.id
           AND reviews.must_read
       ) AS "mustRead"
     FROM articles
     LEFT JOIN LATERAL (
       SELECT reviews.user_id, reviews.content, reviews.rating
       FROM reviews
       WHERE reviews.article_id = articles.id
       ORDER BY reviews.updated_at DESC
       LIMIT 1
     ) latest_review ON TRUE
     LEFT JOIN users latest_reviewer ON latest_reviewer.id = latest_review.user_id
     ORDER BY "isRead" ASC, articles.created_at DESC`,
    [userId],
  );

  return result.rows;
}

export async function getArticlesForReview(userId: number) {
  const result = await database.query<ReaderArticle>(
    `SELECT
            articles.id, articles.title, articles.abstract,
            articles.abstract_zh AS "abstractZh", articles.authors,
            articles.publisher, articles.category, articles.tags,
            articles.published_at::text AS "publishedAt",
            articles.source_url AS "sourceUrl",
            reading_progress.page_number AS "lastReadPage",
            reading_progress.position_y AS "lastReadPositionY",
            reading_progress.position_x AS "lastReadPositionX",
            EXISTS (
              SELECT 1 FROM article_reads
              WHERE article_reads.user_id = $1
                AND article_reads.article_id = articles.id
            ) AS "isRead",
            EXISTS (
              SELECT 1 FROM reading_list
              WHERE reading_list.user_id = $1
                AND reading_list.article_id = articles.id
            ) AS "inReadingList",
            (
              SELECT reading_list.created_at::text FROM reading_list
              WHERE reading_list.user_id = $1
                AND reading_list.article_id = articles.id
            ) AS "readingListAddedAt",
            (
              SELECT article_ratings.rating
              FROM article_ratings
              WHERE article_ratings.user_id = $1
                AND article_ratings.article_id = articles.id
            ) AS "ownRating",
            COALESCE((
              SELECT article_ratings.must_read
              FROM article_ratings
              WHERE article_ratings.user_id = $1
                AND article_ratings.article_id = articles.id
            ), FALSE) AS "ownMustRead",
            CASE
              WHEN EXISTS (
                SELECT 1 FROM article_reads
                WHERE article_reads.user_id = $1 AND article_reads.article_id = articles.id
              ) THEN 'read'
              WHEN reading_progress.article_id IS NOT NULL
                OR (reading_annotation_drafts.article_id IS NOT NULL
                  AND JSONB_ARRAY_LENGTH(reading_annotation_drafts.annotations) > 0)
                OR EXISTS (
                  SELECT 1 FROM published_annotations
                  WHERE published_annotations.user_id = $1 AND published_annotations.article_id = articles.id
                ) THEN 'reading'
              ELSE 'unread'
            END AS "readingStatus",
            NOT EXISTS (SELECT 1 FROM reviews WHERE reviews.article_id = articles.id)
              AND NOT EXISTS (
                SELECT 1 FROM review_comments
                INNER JOIN reviews ON reviews.id = review_comments.review_id
                WHERE reviews.article_id = articles.id
              ) AS "canDelete",
            GREATEST(
              reading_progress.updated_at,
              CASE WHEN reading_annotation_drafts.article_id IS NOT NULL
                AND JSONB_ARRAY_LENGTH(reading_annotation_drafts.annotations) > 0
                THEN reading_annotation_drafts.updated_at END,
              own_annotation_activity.updated_at
            )::text AS "readingActivityAt",
            (
              SELECT ROUND(AVG(article_ratings.rating)::numeric, 1)::float
              FROM article_ratings
              WHERE article_ratings.article_id = articles.id
            ) AS rating,
            (
              SELECT COUNT(*)::int
              FROM article_reads
              WHERE article_reads.article_id = articles.id
            ) AS "readCount",
            (
              SELECT COUNT(*)::int
              FROM article_recent_views
              WHERE article_recent_views.article_id = articles.id
                AND article_recent_views.viewed_at >= NOW() - INTERVAL '5 minutes'
            ) AS "readingNowCount",
            COALESCE(reading_annotation_drafts.annotations, own_annotations.items::jsonb, '[]'::jsonb) AS "savedAnnotations",
            CASE WHEN own_review.id IS NULL THEN NULL ELSE JSON_BUILD_OBJECT(
              'id', own_review.id,
              'rating', own_review.rating,
              'content', own_review.content,
              'reviewType', own_review.review_type,
              'mustRead', own_review.must_read,
              'noteFileName', own_note_pdf.file_name,
              'noteSource', own_note_pdf.source,
              'annotations', COALESCE(own_annotations.items, '[]'::json)
            ) END AS "ownReview"
     FROM articles
     LEFT JOIN reading_progress
       ON reading_progress.article_id = articles.id
      AND reading_progress.user_id = $1
     LEFT JOIN reading_annotation_drafts
       ON reading_annotation_drafts.article_id = articles.id
      AND reading_annotation_drafts.user_id = $1
     LEFT JOIN reviews own_review
       ON own_review.article_id = articles.id
      AND own_review.user_id = $1
     LEFT JOIN reading_note_pdfs own_note_pdf ON own_note_pdf.review_id = own_review.id
     LEFT JOIN LATERAL (
       SELECT JSON_AGG(
         JSON_BUILD_OBJECT(
           'page', review_annotations.page_number,
           'quote', review_annotations.quote,
           'translation', review_annotations.translation,
           'content', review_annotations.content,
           'annotationKind', review_annotations.annotation_kind,
           'highlightRects', review_annotations.highlight_rects,
           'rect', CASE WHEN review_annotations.rect_x IS NULL THEN NULL ELSE JSON_BUILD_OBJECT(
             'x', review_annotations.rect_x,
             'y', review_annotations.rect_y,
             'width', review_annotations.rect_width,
             'height', review_annotations.rect_height
           ) END
         )
         ORDER BY review_annotations.page_number, review_annotations.id
       ) AS items
       FROM review_annotations
       WHERE review_annotations.review_id = own_review.id
         AND review_annotations.rect_x IS NOT NULL
         AND review_annotations.rect_y IS NOT NULL
         AND review_annotations.rect_width IS NOT NULL
         AND review_annotations.rect_height IS NOT NULL
     ) own_annotations ON TRUE
     LEFT JOIN LATERAL (
       SELECT MAX(published_annotations.updated_at) AS updated_at
       FROM published_annotations
       WHERE published_annotations.article_id = articles.id
         AND published_annotations.user_id = $1
     ) own_annotation_activity ON TRUE
     ORDER BY articles.published_at DESC NULLS LAST, articles.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function getUserReviewProfile(userId: number) {
  const [stats, reviews] = await Promise.all([
    database.query<{
      totalLikes: number;
      longReviews: number;
      notePdfs: number;
    }>(
      `SELECT
         COUNT(review_likes.user_id) FILTER (WHERE reading_note_pdfs.review_id IS NOT NULL)::int AS "totalLikes",
         COUNT(DISTINCT reviews.id)::int AS "longReviews",
         COUNT(DISTINCT reading_note_pdfs.review_id)::int AS "notePdfs"
       FROM reviews
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       LEFT JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
       WHERE reviews.user_id = $1`,
      [userId],
    ),
    database.query<{
      id: number;
      articleId: number;
      title: string;
      content: string;
      rating: number | null;
      reviewType: "long";
      mustRead: boolean;
      likeCount: number;
      updatedAt: string;
      noteFileName: string | null;
    }>(
      `SELECT
         reviews.id,
         articles.id AS "articleId",
         articles.title,
         reviews.content,
         reviews.rating,
         reviews.review_type AS "reviewType",
         reviews.must_read AS "mustRead",
         COUNT(review_likes.user_id)::int AS "likeCount",
         reviews.updated_at::text AS "updatedAt"
         ,reading_note_pdfs.file_name AS "noteFileName"
       FROM reviews
       INNER JOIN articles ON articles.id = reviews.article_id
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       LEFT JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
       WHERE reviews.user_id = $1
       GROUP BY reviews.id, articles.id, articles.title, reading_note_pdfs.file_name
       ORDER BY COUNT(review_likes.user_id) DESC, reviews.updated_at DESC`,
      [userId],
    ),
  ]);

  return {
    stats: stats.rows[0] ?? { totalLikes: 0, longReviews: 0, notePdfs: 0 },
    reviews: reviews.rows,
  };
}
