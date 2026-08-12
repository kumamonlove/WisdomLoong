import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchArxiv } from "@/lib/arxiv-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const title = new URL(request.url).searchParams.get("title")?.trim();
  if (!title || title.length < 2) {
    return NextResponse.json({ error: "请输入至少 2 个字符的文章名" }, { status: 400 });
  }

  try {
    const results = await searchArxiv(title);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("arXiv lookup failed", error);
    return NextResponse.json(
      { error: "暂时无法连接 arXiv，请稍后重试" },
      { status: 502 },
    );
  }
}
