import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { database } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "管理员登录已失效，请重新登录" }, { status: 401 });
  }

  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const result = await database.query<{ username: string }>(
    "DELETE FROM users WHERE id = $1 RETURNING username",
    [userId],
  );
  if (result.rowCount !== 1) {
    return NextResponse.json({ error: "用户不存在或已经被删除" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, username: result.rows[0].username });
}
