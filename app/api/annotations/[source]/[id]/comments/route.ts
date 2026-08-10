import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { database } from "@/lib/db";

type AnnotationSource = "published" | "review";
type AnnotationComment = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

async function resolveTarget(params: Promise<{ source: string; id: string }>) {
  const values = await params;
  const source = values.source === "published" || values.source === "review"
    ? values.source as AnnotationSource
    : null;
  const id = Number(values.id);
  return source && Number.isInteger(id) && id > 0 ? { source, id } : null;
}

function targetColumn(source: AnnotationSource) {
  return source === "published" ? "published_annotation_id" : "review_annotation_id";
}

function targetTable(source: AnnotationSource) {
  return source === "published" ? "published_annotations" : "review_annotations";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const target = await resolveTarget(params);
  if (!target) return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  const column = targetColumn(target.source);
  const result = await database.query<AnnotationComment>(
    `SELECT annotation_comments.id, users.username AS author, annotation_comments.content,
            annotation_comments.created_at::text AS "createdAt",
            annotation_comments.user_id = $2 AS "isOwn"
     FROM annotation_comments
     INNER JOIN users ON users.id = annotation_comments.user_id
     WHERE annotation_comments.${column} = $1
     ORDER BY annotation_comments.created_at, annotation_comments.id`,
    [target.id, user.id],
  );
  return NextResponse.json({ comments: result.rows });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const target = await resolveTarget(params);
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim() ?? "";
  if (!target) return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  if (!content || content.length > 1000) {
    return NextResponse.json({ error: "评论须为 1—1000 个字符" }, { status: 400 });
  }
  const column = targetColumn(target.source);
  const table = targetTable(target.source);
  const result = await database.query<AnnotationComment>(
    `INSERT INTO annotation_comments (${column}, user_id, content)
     SELECT $1, $2, $3 FROM ${table} WHERE id = $1
     RETURNING id, $4::text AS author, content, created_at::text AS "createdAt", TRUE AS "isOwn"`,
    [target.id, user.id, content, user.username],
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "批注不存在" }, { status: 404 });
  return NextResponse.json({ comment: result.rows[0] }, { status: 201 });
}
