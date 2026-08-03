import { NextResponse } from "next/server";
import { getCurrentUser, updateUsername } from "@/lib/auth";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = (await request.json()) as { username?: unknown };
  const result = await updateUsername(user.id, String(body.username ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, username: result.user.username });
}
