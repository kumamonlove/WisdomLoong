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

  const result = await database.query<{ file_name: string; pdf_data: Buffer }>(
    "SELECT file_name, pdf_data FROM reading_note_pdfs WHERE review_id = $1",
    [reviewId],
  );
  const note = result.rows[0];
  if (!note) return NextResponse.json({ error: "读书笔记不存在" }, { status: 404 });

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
