import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";

export const runtime = "nodejs";

function redirectToLogin(error: string) {
  const params = new URLSearchParams({ error });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/login?${params}` },
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const result = await authenticateUser(username, password);

    if (!result.ok) {
      return redirectToLogin(result.error);
    }

    await createSession(result.user.id);
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/" },
    });
  } catch (error) {
    console.error("Login failed", error);
    return redirectToLogin("登录暂时不可用，请稍后重试");
  }
}
