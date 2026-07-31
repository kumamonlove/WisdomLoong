import { database } from "@/lib/db";
import {
  categories,
  type ArticleCategory,
  type Category,
  type ReviewFilter,
  type SortOrder,
} from "@/lib/knowledge-types";

export {
  categories,
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
  reviews?: {
    id: number;
    author: string;
    content: string;
    rating: number;
    reviewType: "short" | "long";
    mustRead: boolean;
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
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCategory(
  value: string | string[] | undefined,
): Category {
  const selected = firstValue(value);
  return categories.find((item) => item === selected) ?? "全部";
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
       review_group.reviews
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
     ORDER BY review_group.rating DESC, articles.published_at DESC NULLS LAST`,
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
       review_stats.average_rating AS rating
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
       SELECT ROUND(AVG(reviews.rating)::numeric, 1)::float AS average_rating
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
  const result = await database.query<{ category: ArticleCategory; count: number }>(
    `SELECT category, COUNT(*)::int AS count
     FROM articles
     GROUP BY category`,
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
       latest_review.rating
     FROM reading_list
     INNER JOIN articles ON articles.id = reading_list.article_id
     LEFT JOIN LATERAL (
       SELECT reviews.user_id, reviews.content, reviews.rating
       FROM reviews
       WHERE reviews.article_id = articles.id
       ORDER BY reviews.updated_at DESC
       LIMIT 1
     ) latest_review ON TRUE
     LEFT JOIN users latest_reviewer ON latest_reviewer.id = latest_review.user_id
     WHERE reading_list.user_id = $1
     ORDER BY reading_list.created_at DESC`,
    [userId],
  );

  return result.rows;
}

export async function getArticlesForReview() {
  const result = await database.query<ReaderArticle>(
    `SELECT id, title, abstract, authors, publisher, category, tags,
            published_at::text AS "publishedAt", source_url AS "sourceUrl"
     FROM articles
     ORDER BY created_at DESC`,
  );
  return result.rows;
}
