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
  rating: number | null;
  mustRead?: boolean;
  reviews?: {
    id: number;
    author: string;
    content: string;
    rating: number;
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
  isRead: boolean;
  savedAnnotations: {
    page: number;
    quote: string;
    translation: string;
    content: string;
    rect?: { x: number; y: number; width: number; height: number } | null;
  }[];
  ownReview: {
    id: number;
    rating: number;
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

export async function getTeamReadingArticles() {
  const result = await database.query<ArticleCardData>(
    `WITH review_stats AS (
       SELECT
         article_id,
         ROUND(AVG(rating)::numeric, 1)::float AS average_rating,
         BOOL_OR(must_read) AS must_read,
         COUNT(*)::int AS long_review_count,
         COUNT(*) FILTER (WHERE must_read)::int AS must_read_count,
         MAX(updated_at) AS last_reviewed_at
       FROM reviews
       GROUP BY article_id
     ),
     note_like_stats AS (
       SELECT reviews.article_id, COUNT(review_likes.user_id)::int AS like_count
       FROM reviews
       INNER JOIN reading_note_pdfs ON reading_note_pdfs.review_id = reviews.id
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       GROUP BY reviews.article_id
     ),
     latest_reviews AS (
       SELECT DISTINCT ON (article_id)
         article_id, user_id, content
       FROM reviews
       ORDER BY article_id, updated_at DESC, id DESC
     )
     SELECT
       articles.id,
       articles.title,
       articles.category,
       articles.tags,
       articles.publisher,
       articles.published_at::text AS "publishedAt",
       articles.source_url AS "sourceUrl",
       articles.authors,
       latest_reviewer.username AS "reviewAuthor",
       latest_reviews.content AS "reviewContent",
       review_stats.average_rating AS rating,
       review_stats.must_read AS "mustRead",
       JSON_BUILD_OBJECT(
         'readCount', 0,
         'longReviewCount', review_stats.long_review_count,
         'mustReadCount', review_stats.must_read_count,
         'likeCount', COALESCE(note_like_stats.like_count, 0)
       ) AS "recommendationSignals"
     FROM review_stats
     INNER JOIN articles ON articles.id = review_stats.article_id
     INNER JOIN latest_reviews ON latest_reviews.article_id = articles.id
     INNER JOIN users latest_reviewer ON latest_reviewer.id = latest_reviews.user_id
     LEFT JOIN note_like_stats ON note_like_stats.article_id = articles.id
     ORDER BY review_stats.last_reviewed_at DESC
     LIMIT 4`,
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
            EXISTS (
              SELECT 1 FROM article_reads
              WHERE article_reads.user_id = $1
                AND article_reads.article_id = articles.id
            ) AS "isRead",
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
     ORDER BY articles.created_at DESC`,
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
      rating: number;
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
