import { NextRequest, NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const invitationCode = String(formData.get("invitationCode") ?? "");

  try {
    const result = await registerUser(username, password, invitationCode);

    if (!result.ok) {
      const url = new URL("/register", request.url);
      url.searchParams.set("error", result.error);
      return NextResponse.redirect(url, 303);
    }

    await createSession(result.user.id);
    return NextResponse.redirect(new URL("/", request.url), 303);
  } catch (error) {
    console.error("Registration failed", error);
    const url = new URL("/register", request.url);
    url.searchParams.set("error", "注册暂时不可用，请稍后重试");
    return NextResponse.redirect(url, 303);
  }
}
