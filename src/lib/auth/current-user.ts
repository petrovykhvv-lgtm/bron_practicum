import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { jsonError } from "@/lib/http";
import { createSession, deleteSession, findSessionUser, type PublicUser } from "./service";
import { SESSION_COOKIE } from "./tokens";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  return findSessionUser(prisma, store.get(SESSION_COOKIE)?.value);
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(prisma, userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure только если сервис отдаётся по HTTPS (SESSION_COOKIE_SECURE=true): по http://localhost Safari отвергает такие cookie.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  await deleteSession(prisma, store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}

// Проверка для route handlers: сначала сессия (401), затем право по матрице ролей (403).
export async function authorizeApi(
  permission?: Permission,
): Promise<{ ok: true; user: PublicUser } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: jsonError(401, "unauthenticated", "Войдите в систему") };
  if (permission && !can(user.role, permission)) {
    return { ok: false, response: jsonError(403, "forbidden", "Недостаточно прав для этого действия") };
  }
  return { ok: true, user };
}
