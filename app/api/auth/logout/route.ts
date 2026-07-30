import { NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await deleteCurrentSession();
  } catch (error) {
    console.error("Logout failed", error);
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
