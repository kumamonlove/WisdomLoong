import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getKnowledgeGraph, mutateKnowledgeGraph, type KnowledgeGraphMutation } from "@/lib/knowledge-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const domain = new URL(request.url).searchParams.get("domain")?.trim();
  if (!domain || domain.length > 24 || domain === "全部") {
    return NextResponse.json({ error: "请选择有效的知识领域" }, { status: 400 });
  }
  return NextResponse.json({ graph: await getKnowledgeGraph(domain, user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as KnowledgeGraphMutation | null;
  if (!body || !["place", "move", "remove", "connect", "disconnect", "note"].includes(body.action)) {
    return NextResponse.json({ error: "画板操作无效" }, { status: 400 });
  }
  try {
    await mutateKnowledgeGraph(body, user.id);
    return NextResponse.json({ ok: true, graph: await getKnowledgeGraph(body.domain, user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画板保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
