import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const ids = [...new Set(
    (new URL(request.url).searchParams.get("ids") ?? "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  )].slice(0, 200);

  if (ids.length === 0) return NextResponse.json({ articles: [] });

  const result = await database.query<{
    id: number;
    abstract: string;
    abstractZh: string;
  }>(
    `SELECT id, abstract, abstract_zh AS "abstractZh"
     FROM articles
     WHERE id = ANY($1::integer[])`,
    [ids],
  );

  return NextResponse.json({ articles: result.rows });
}
