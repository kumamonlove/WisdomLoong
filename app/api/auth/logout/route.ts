import { NextRequest, NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await deleteCurrentSession();
  } catch (error) {
    console.error("Logout failed", error);
  }

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
