import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "@/lib/db";

const adminCookieName = "wisdomloong_admin";
const adminUsername = process.env.ADMIN_USERNAME ?? "Wisdomloong";
const adminPassword = process.env.ADMIN_PASSWORD ?? "123";
const adminSessionDurationSeconds = 60 * 60 * 12;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyAdminCredentials(username: string, password: string) {
  return safeEqual(username, adminUsername) && safeEqual(password, adminPassword);
}

export async function createAdminSession() {
  const token = randomBytes(32).toString("base64url");
  await database.query(
    `INSERT INTO admin_sessions (token_hash, expires_at)
     VALUES ($1, NOW() + ($2 * INTERVAL '1 second'))`,
    [hashToken(token), adminSessionDurationSeconds],
  );
  (await cookies()).set(adminCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: adminSessionDurationSeconds,
  });
}

export async function deleteAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName)?.value;
  if (token) {
    await database.query("DELETE FROM admin_sessions WHERE token_hash = $1", [
      hashToken(token),
    ]);
  }
  cookieStore.delete(adminCookieName);
}

export async function isAdmin() {
  const token = (await cookies()).get(adminCookieName)?.value;
  if (!token) return false;
  const result = await database.query(
    `SELECT 1 FROM admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [hashToken(token)],
  );
  return result.rowCount === 1;
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/dashboard/login");
}
