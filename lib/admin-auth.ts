import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const adminCookieName = "wisdomloong_admin";
const adminUsername = process.env.ADMIN_USERNAME ?? "Wisdomloong";
const adminPassword = process.env.ADMIN_PASSWORD ?? "123";

function expectedToken() {
  return createHash("sha256")
    .update(`${adminUsername}:${adminPassword}:${process.env.ADMIN_SESSION_SECRET ?? "wisdomloong-admin"}`)
    .digest("hex");
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
  (await cookies()).set(adminCookieName, expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function deleteAdminSession() {
  (await cookies()).delete(adminCookieName);
}

export async function isAdmin() {
  const token = (await cookies()).get(adminCookieName)?.value;
  return Boolean(token && safeEqual(token, expectedToken()));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/dashboard/login");
}
