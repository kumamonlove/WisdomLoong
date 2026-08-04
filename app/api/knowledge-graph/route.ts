import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshKnowledgeGraphDomain } from "@/lib/knowledge-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { domain?: string };
  const domain = body.domain?.trim();
  if (!domain || domain.length > 24 || domain === "全部") {
    return NextResponse.json({ error: "请选择有效的知识领域" }, { status: 400 });
  }

  try {
    await refreshKnowledgeGraphDomain(domain);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Knowledge graph refresh failed", domain, error);
    return NextResponse.json({ error: "AI 暂时无法更新该领域图谱，请稍后重试" }, { status: 502 });
  }
}
