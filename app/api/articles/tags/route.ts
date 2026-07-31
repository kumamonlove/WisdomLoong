import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const result = await database.query<{ tag: string }>(
    `SELECT DISTINCT tag
     FROM articles
     CROSS JOIN LATERAL UNNEST(articles.tags) AS tag
     WHERE BTRIM(tag) <> ''
     ORDER BY tag
     LIMIT 100`,
  );

  return NextResponse.json({ tags: result.rows.map((row) => row.tag) });
}
