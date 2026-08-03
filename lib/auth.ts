import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "@/lib/db";

const scryptAsync = promisify(scrypt);
const sessionCookieName = "wisdomloong_session";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

export type AuthUser = {
  id: number;
  username: string;
};

type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

function usernameKey(username: string) {
  return username.toLocaleLowerCase("en-US");
}

function validateCredentials(username: string, password: string) {
  if (username.length < 2 || username.length > 32) {
    return "用户名需要为 2–32 个字符";
  }

  if (/[\u0000-\u001f\u007f]/.test(username)) {
    return "用户名不能包含控制字符";
  }

  if (!password) {
    return "请输入密码";
  }

  return null;
}

export async function updateUsername(userId: number, rawUsername: string): Promise<AuthResult> {
  const username = rawUsername.trim();
  const validationError = validateCredentials(username, "session-authenticated");

  if (validationError) return { ok: false, error: validationError };

  try {
    const result = await database.query<AuthUser>(
      `UPDATE users
       SET username = $1, username_key = $2
       WHERE id = $3
       RETURNING id, username`,
      [username, usernameKey(username), userId],
    );
    return result.rows[0]
      ? { ok: true, user: result.rows[0] }
      : { ok: false, error: "用户不存在" };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return { ok: false, error: "该用户名已被使用" };
    }
    throw error;
  }
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64")}:${derivedKey.toString("base64")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltValue, hashValue] = storedHash.split(":");

  if (algorithm !== "scrypt" || !saltValue || !hashValue) {
    return false;
  }

  const expectedHash = Buffer.from(hashValue, "base64");
  const derivedKey = (await scryptAsync(
    password,
    Buffer.from(saltValue, "base64"),
    expectedHash.length,
  )) as Buffer;

  return timingSafeEqual(derivedKey, expectedHash);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerUser(
  rawUsername: string,
  password: string,
  invitationCode: string,
): Promise<AuthResult> {
  const username = rawUsername.trim();
  const validationError = validateCredentials(username, password);

  if (validationError) {
    return { ok: false, error: validationError };
  }

  const configuredCode = process.env.REGISTRATION_INVITE_CODE;

  if (!configuredCode) {
    return { ok: false, error: "注册功能尚未配置，请联系管理员" };
  }

  if (!safeEqual(invitationCode, configuredCode)) {
    return { ok: false, error: "邀请码不正确" };
  }

  const passwordHash = await hashPassword(password);

  try {
    const result = await database.query<AuthUser>(
      `INSERT INTO users (username, username_key, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username`,
      [username, usernameKey(username), passwordHash],
    );

    return { ok: true, user: result.rows[0] };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return { ok: false, error: "该用户名已被注册" };
    }

    throw error;
  }
}

export async function authenticateUser(
  rawUsername: string,
  password: string,
): Promise<AuthResult> {
  const username = rawUsername.trim();

  if (!username || username.length > 32 || !password) {
    return { ok: false, error: "请输入用户名和密码" };
  }

  const result = await database.query<AuthUser & { password_hash: string }>(
    `SELECT id, username, password_hash
     FROM users
     WHERE username_key = $1`,
    [usernameKey(username)],
  );
  const user = result.rows[0];

  if (!user) {
    await scryptAsync(password, Buffer.alloc(16), 64);
    return { ok: false, error: "用户名或密码不正确" };
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    return { ok: false, error: "用户名或密码不正确" };
  }

  return {
    ok: true,
    user: { id: user.id, username: user.username },
  };
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);

  await database.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hashSessionToken(token), userId, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionDurationSeconds,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await database.query("DELETE FROM sessions WHERE token_hash = $1", [
      hashSessionToken(token),
    ]);
  }

  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const result = await database.query<AuthUser>(
    `SELECT users.id, users.username
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1
       AND sessions.expires_at > NOW()`,
    [hashSessionToken(token)],
  );

  return result.rows[0] ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
