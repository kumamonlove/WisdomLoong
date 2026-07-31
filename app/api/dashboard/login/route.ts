import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminCredentials } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.redirect(new URL("/dashboard/login?error=1", request.url), 303);
  }
  await createAdminSession();
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
