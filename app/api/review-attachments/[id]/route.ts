import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "截图不存在" }, { status: 404 });
  }
  const result = await database.query<{ content_type: string; image_data: Buffer }>(
    `SELECT review_attachments.content_type, review_attachments.image_data
     FROM review_attachments
     INNER JOIN reviews ON reviews.id = review_attachments.review_id
     WHERE review_attachments.id = $1
       AND can_users_share_content($2, reviews.user_id)`,
    [id, user.id],
  );
  const attachment = result.rows[0];
  if (!attachment) return NextResponse.json({ error: "截图不存在" }, { status: 404 });

  return new NextResponse(new Uint8Array(attachment.image_data), {
    headers: {
      "Content-Type": attachment.content_type,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
