import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const result = await authenticateUser(username, password);

    if (!result.ok) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", result.error);
      return NextResponse.redirect(url, 303);
    }

    await createSession(result.user.id);
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    console.error("Login failed", error);
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "登录暂时不可用，请稍后重试");
    return NextResponse.redirect(url, 303);
  }
}
