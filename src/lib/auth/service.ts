import type { PrismaClient, Role } from "@/generated/prisma/client";
import { checkRoleChange, PUBLIC_USER_SELECT, type RoleChangeResult } from "@/lib/permissions";
import { hashPassword, verifyPassword } from "./password";
import { generateSessionToken, hashSessionToken, SESSION_TTL_DAYS } from "./tokens";
import type { LoginInput, RegisterInput } from "./schemas";

// Все функции возвращают только публичные поля: passwordHash наружу не выходит.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export type RegisterResult = { ok: true; user: PublicUser } | { ok: false; reason: "email_taken" };

export async function registerUser(db: PrismaClient, input: RegisterInput): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    // Роль при регистрации всегда user: клиент её задать не может.
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, role: "user" },
        select: PUBLIC_USER_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: created.id,
          action: "user_registered",
          entityType: "User",
          entityId: created.id,
          after: { email: created.email, role: created.role },
        },
      });
      return created;
    });
    return { ok: true, user };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, reason: "email_taken" };
    throw error;
  }
}

// Хеш для сравнения, когда пользователя с таким email нет: время ответа не выдаёт, существует ли email.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("verde-marea-timing-equalizer");
  return dummyHash;
}

export async function authenticate(db: PrismaClient, input: LoginInput): Promise<PublicUser | null> {
  const found = await db.user.findUnique({
    where: { email: input.email },
    select: { ...PUBLIC_USER_SELECT, passwordHash: true },
  });
  const matches = await verifyPassword(input.password, found?.passwordHash ?? (await getDummyHash()));
  if (!found || !matches) return null;
  const { passwordHash: _omit, ...user } = found;
  void _omit;
  return user;
}

export async function createSession(db: PrismaClient, userId: string, now = new Date()) {
  // Просроченные сессии удаляются при каждом новом входе: отдельная чистка не нужна.
  await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

// Роль берётся из БД при каждом запросе: смена роли действует сразу, без перелогина.
export async function findSessionUser(
  db: PrismaClient,
  token: string | undefined,
  now = new Date(),
): Promise<PublicUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { id: true, expiresAt: true, user: { select: PUBLIC_USER_SELECT } },
  });
  if (!session) return null;
  if (session.expiresAt <= now) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export async function deleteSession(db: PrismaClient, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export function listUsers(db: PrismaClient): Promise<PublicUser[]> {
  return db.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: [{ createdAt: "asc" }, { email: "asc" }] });
}

export type ChangeRoleResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: "not_found" | "stale" | Exclude<RoleChangeResult, { ok: true }>["reason"] };

export async function changeUserRole(
  db: PrismaClient,
  input: { actor: { id: string; role: Role }; targetId: string; newRole: Role },
): Promise<ChangeRoleResult> {
  const { actor, targetId, newRole } = input;
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId }, select: PUBLIC_USER_SELECT });
    if (!target) return { ok: false, reason: "not_found" } as const;

    const check = checkRoleChange({ actorRole: actor.role, targetRole: target.role, newRole });
    if (!check.ok) return { ok: false, reason: check.reason } as const;

    // Условие по текущей роли защищает от гонки двух одновременных изменений.
    const updated = await tx.user.updateMany({
      where: { id: targetId, role: target.role },
      data: { role: newRole },
    });
    if (updated.count !== 1) return { ok: false, reason: "stale" } as const;

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user_role_changed",
        entityType: "User",
        entityId: targetId,
        before: { role: target.role },
        after: { role: newRole },
      },
    });
    await tx.notification.create({
      data: {
        userId: targetId,
        type: "role_changed",
        title: "Роль изменена",
        body: newRole === "admin" ? "Вам назначена роль администратора." : "Роль администратора снята.",
      },
    });
    return { ok: true, user: { ...target, role: newRole } } as const;
  });
}
