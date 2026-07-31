import { NextResponse } from "next/server";
import { deleteAdminSession } from "@/lib/admin-auth";

export async function POST() {
  await deleteAdminSession();
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/dashboard/login" },
  });
}
