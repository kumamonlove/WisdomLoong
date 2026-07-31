import { NextResponse } from "next/server";
import { deleteAdminSession } from "@/lib/admin-auth";

export async function POST(request: Request) {
  await deleteAdminSession();
  return NextResponse.redirect(new URL("/dashboard/login", request.url), 303);
}
