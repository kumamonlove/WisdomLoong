import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const result = await database.query<{ id: number }>(
    `WITH review_activity AS (
       SELECT article_id, MAX(updated_at) AS last_reviewed_at
       FROM reviews
       GROUP BY article_id
     )
     SELECT articles.id
     FROM articles
     LEFT JOIN article_recent_views
       ON article_recent_views.article_id = articles.id
      AND article_recent_views.user_id = $1
     LEFT JOIN review_activity ON review_activity.article_id = articles.id
     ORDER BY
       article_recent_views.viewed_at DESC NULLS LAST,
       review_activity.last_reviewed_at DESC NULLS LAST,
       articles.created_at DESC`,
    [user.id],
  );

  return NextResponse.json(
    { urls: result.rows.map((article) => `/api/articles/${article.id}/pdf`) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
