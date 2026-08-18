import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const reviewId = Number((await params).reviewId);
  if (!Number.isInteger(reviewId)) return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });

  const result = await database.query<{ file_name: string; pdf_data: Buffer; owner_id: number }>(
    `SELECT reading_note_pdfs.file_name, reading_note_pdfs.pdf_data, reviews.user_id AS owner_id
     FROM reading_note_pdfs
     INNER JOIN reviews ON reviews.id = reading_note_pdfs.review_id
     WHERE reading_note_pdfs.review_id = $1
       AND can_users_share_content($2, reviews.user_id)`,
    [reviewId, user.id],
  );
  const note = result.rows[0];
  if (!note) return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });

  if (note.owner_id !== user.id) {
    await database.query(
      `INSERT INTO reading_note_reads (user_id, review_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, review_id) DO UPDATE SET last_read_at = NOW()`,
      [user.id, reviewId],
    );
  }

  const safeName = note.file_name.replace(/[\r\n"\\]/g, "_");
  return new NextResponse(new Uint8Array(note.pdf_data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(safeName)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
