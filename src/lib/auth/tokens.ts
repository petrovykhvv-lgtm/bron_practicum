import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "vm_session";
export const SESSION_TTL_DAYS = 7;

// Токен сессии — случайные 256 бит. Это не пароль: хешируем быстрым SHA-256, чтобы в БД не лежал сам токен.
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
