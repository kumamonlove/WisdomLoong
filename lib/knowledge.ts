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
    reviewType: "short" | "long";
    mustRead: boolean;
    likeCount: number;
    likedByViewer: boolean;
    updatedAt: string;
    attachments: { id: number; note: string }[];
    annotations: {
      id: number;
      page: number;
      quote: string;
      translation: string;
      content: string;
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
  authors: string[];
  publisher: string;
  category: ArticleCategory;
  tags: string[];
  publishedAt: string | null;
  sourceUrl: string;
  lastReadPage: number | null;
  ownReview: {
    rating: number;
    content: string;
    reviewType: "short" | "long";
    mustRead: boolean;
    annotations: {
      page: number;
      quote: string;
      translation: string;
      content: string;
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

export async function getRecommendedArticles(userId: number) {
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
       review_group.rating,
       review_group.reviews,
       JSON_BUILD_OBJECT(
         'readCount', article_signals.read_count,
         'longReviewCount', article_signals.long_review_count,
         'mustReadCount', article_signals.must_read_count,
         'likeCount', article_signals.like_count
       ) AS "recommendationSignals"
     FROM articles
     INNER JOIN LATERAL (
       SELECT
         ROUND(AVG(reviews.rating)::numeric, 1)::float AS rating,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', reviews.id,
             'author', users.username,
             'content', reviews.content,
             'rating', reviews.rating,
             'reviewType', reviews.review_type,
             'mustRead', reviews.must_read,
             'likeCount', COALESCE(likes.like_count, 0),
             'likedByViewer', COALESCE(likes.liked_by_viewer, FALSE),
             'updatedAt', reviews.updated_at,
             'attachments', COALESCE(attachments.items, '[]'::json)
             ,'annotations', COALESCE(annotations.items, '[]'::json)
           )
           ORDER BY reviews.must_read DESC, reviews.review_type DESC,
                    CHAR_LENGTH(reviews.content) DESC, reviews.updated_at DESC
         ) AS reviews
       FROM reviews
       INNER JOIN users ON users.id = reviews.user_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS like_count,
           BOOL_OR(review_likes.user_id = $1) AS liked_by_viewer
         FROM review_likes
         WHERE review_likes.review_id = reviews.id
       ) likes ON TRUE
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', review_attachments.id,
             'note', review_attachments.note
           )
           ORDER BY review_attachments.id
         ) AS items
         FROM review_attachments
         WHERE review_attachments.review_id = reviews.id
       ) attachments ON TRUE
       LEFT JOIN LATERAL (
         SELECT JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', review_annotations.id,
             'page', review_annotations.page_number,
             'quote', review_annotations.quote,
             'translation', review_annotations.translation,
             'content', review_annotations.content
           )
           ORDER BY review_annotations.page_number, review_annotations.id
         ) AS items
         FROM review_annotations
         WHERE review_annotations.review_id = reviews.id
       ) annotations ON TRUE
       WHERE reviews.article_id = articles.id
         AND reviews.user_id <> $1
         AND reviews.rating >= 4
     ) review_group ON review_group.reviews IS NOT NULL
     INNER JOIN LATERAL (
       SELECT
         (
           SELECT COUNT(*)::int
           FROM article_reads
           WHERE article_reads.article_id = articles.id
         ) AS read_count,
         COUNT(DISTINCT reviews.id) FILTER (WHERE reviews.review_type = 'long')::int AS long_review_count,
         COUNT(DISTINCT reviews.id) FILTER (WHERE reviews.must_read)::int AS must_read_count,
         COUNT(DISTINCT review_likes.user_id)::int AS like_count
       FROM reviews
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       WHERE reviews.article_id = articles.id
     ) article_signals ON TRUE
     ORDER BY review_group.rating DESC, articles.published_at DESC NULLS LAST
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
     WHERE NOT EXISTS (
       SELECT 1 FROM article_reads
       WHERE article_reads.user_id = $1
         AND article_reads.article_id = articles.id
     )
       AND NOT EXISTS (
         SELECT 1 FROM reviews
         WHERE reviews.user_id = $1
           AND reviews.article_id = articles.id
       )
     ORDER BY articles.created_at DESC`,
    [userId],
  );

  return result.rows;
}

export async function getArticlesForReview(userId: number) {
  const result = await database.query<ReaderArticle>(
    `SELECT
            articles.id, articles.title, articles.abstract, articles.authors,
            articles.publisher, articles.category, articles.tags,
            articles.published_at::text AS "publishedAt",
            articles.source_url AS "sourceUrl",
            reading_progress.page_number AS "lastReadPage",
            CASE WHEN own_review.id IS NULL THEN NULL ELSE JSON_BUILD_OBJECT(
              'rating', own_review.rating,
              'content', own_review.content,
              'reviewType', own_review.review_type,
              'mustRead', own_review.must_read,
              'annotations', COALESCE(own_annotations.items, '[]'::json)
            ) END AS "ownReview"
     FROM articles
     LEFT JOIN reading_progress
       ON reading_progress.article_id = articles.id
      AND reading_progress.user_id = $1
     LEFT JOIN reviews own_review
       ON own_review.article_id = articles.id
      AND own_review.user_id = $1
     LEFT JOIN LATERAL (
       SELECT JSON_AGG(
         JSON_BUILD_OBJECT(
           'page', review_annotations.page_number,
           'quote', review_annotations.quote,
           'translation', review_annotations.translation,
           'content', review_annotations.content
         )
         ORDER BY review_annotations.page_number, review_annotations.id
       ) AS items
       FROM review_annotations
       WHERE review_annotations.review_id = own_review.id
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
      shortReviews: number;
    }>(
      `SELECT
         COUNT(review_likes.user_id)::int AS "totalLikes",
         COUNT(DISTINCT reviews.id) FILTER (WHERE reviews.review_type = 'long')::int AS "longReviews",
         COUNT(DISTINCT reviews.id) FILTER (WHERE reviews.review_type = 'short')::int AS "shortReviews"
       FROM reviews
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       WHERE reviews.user_id = $1`,
      [userId],
    ),
    database.query<{
      id: number;
      title: string;
      content: string;
      rating: number;
      reviewType: "short" | "long";
      mustRead: boolean;
      likeCount: number;
      updatedAt: string;
    }>(
      `SELECT
         reviews.id,
         articles.title,
         reviews.content,
         reviews.rating,
         reviews.review_type AS "reviewType",
         reviews.must_read AS "mustRead",
         COUNT(review_likes.user_id)::int AS "likeCount",
         reviews.updated_at::text AS "updatedAt"
       FROM reviews
       INNER JOIN articles ON articles.id = reviews.article_id
       LEFT JOIN review_likes ON review_likes.review_id = reviews.id
       WHERE reviews.user_id = $1
       GROUP BY reviews.id, articles.title
       ORDER BY COUNT(review_likes.user_id) DESC, reviews.updated_at DESC`,
      [userId],
    ),
  ]);

  return {
    stats: stats.rows[0] ?? { totalLikes: 0, longReviews: 0, shortReviews: 0 },
    reviews: reviews.rows,
  };
}
