import { NextRequest, NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/auth";

export const runtime = "nodejs";

function redirectToRegister(error: string) {
  const params = new URLSearchParams({ error });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/register?${params}` },
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const invitationCode = String(formData.get("invitationCode") ?? "");

  try {
    const result = await registerUser(username, password, invitationCode);

    if (!result.ok) {
      return redirectToRegister(result.error);
    }

    await createSession(result.user.id);
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/" },
    });
  } catch (error) {
    console.error("Registration failed", error);
    return redirectToRegister("注册暂时不可用，请稍后重试");
  }
}
