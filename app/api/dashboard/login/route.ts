import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminCredentials } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  if (!verifyAdminCredentials(username, password)) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/dashboard/login?error=1" },
    });
  }
  await createAdminSession();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/dashboard" },
  });
}
