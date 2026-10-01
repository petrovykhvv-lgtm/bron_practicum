// Интеграционные тесты auth-слоя на тестовой БД (TEST_DATABASE_URL); без неё пропускаются.
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";
import {
  authenticate,
  changeUserRole,
  createSession,
  deleteSession,
  findSessionUser,
  listUsers,
  registerUser,
} from "@/lib/auth/service";
import { loginSchema, registerSchema, roleChangeSchema } from "@/lib/auth/schemas";
import { hashSessionToken } from "@/lib/auth/tokens";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const PASSWORD = "Test-Password-1";

run("auth-lite", () => {
  const db = createPrismaClient(url);

  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  });
  beforeEach(async () => {
    await db.session.deleteMany();
    await db.notification.deleteMany();
    await db.auditLog.deleteMany();
    await db.booking.deleteMany();
    await db.user.deleteMany();
  });
  afterAll(() => db.$disconnect());

  async function mk(email: string, role: "user" | "admin" | "super_admin" = "user") {
    const result = await registerUser(db, { email, name: email, password: PASSWORD });
    if (!result.ok) throw new Error("register failed");
    if (role !== "user") await db.user.update({ where: { id: result.user.id }, data: { role } });
    return { id: result.user.id, role };
  }

  describe("регистрация и пароль", () => {
    it("хранит только bcrypt-хеш с 12 раундами и пишет аудит", async () => {
      const r = await registerUser(db, { email: "a@t.local", name: "A", password: PASSWORD });
      expect(r.ok).toBe(true);
      const row = await db.user.findUniqueOrThrow({ where: { email: "a@t.local" } });
      expect(row.passwordHash).not.toContain(PASSWORD);
      expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(await db.auditLog.count({ where: { action: "user_registered", entityId: row.id } })).toBe(1);
    });

    it("публичный результат не содержит passwordHash", async () => {
      const r = await registerUser(db, { email: "a@t.local", name: "A", password: PASSWORD });
      if (!r.ok) throw new Error();
      expect(Object.keys(r.user)).not.toContain("passwordHash");
      const a = await authenticate(db, { email: "a@t.local", password: PASSWORD });
      expect(Object.keys(a!)).not.toContain("passwordHash");
      for (const u of await listUsers(db)) expect(Object.keys(u)).not.toContain("passwordHash");
    });

    it("новый пользователь всегда user, дубль email отклоняется", async () => {
      const r = await registerUser(db, { email: "a@t.local", name: "A", password: PASSWORD });
      expect(r.ok && r.user.role).toBe("user");
      expect(await registerUser(db, { email: "a@t.local", name: "B", password: PASSWORD })).toEqual({ ok: false, reason: "email_taken" });
    });
  });

  describe("вход", () => {
    it("пускает с верным паролем и отклоняет неверный и неизвестный email", async () => {
      await mk("a@t.local");
      expect((await authenticate(db, { email: "a@t.local", password: PASSWORD }))?.email).toBe("a@t.local");
      expect(await authenticate(db, { email: "a@t.local", password: "wrong-password" })).toBeNull();
      expect(await authenticate(db, { email: "nobody@t.local", password: PASSWORD })).toBeNull();
    });
  });

  describe("сессия", () => {
    it("в БД лежит хеш токена, токен находит пользователя", async () => {
      const u = await mk("a@t.local");
      const { token } = await createSession(db, u.id);
      const stored = await db.session.findFirstOrThrow({ where: { userId: u.id } });
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(hashSessionToken(token));
      expect((await findSessionUser(db, token))?.id).toBe(u.id);
    });

    it("не находит чужой, пустой и просроченный токен; просроченная сессия удаляется", async () => {
      const u = await mk("a@t.local");
      const { token } = await createSession(db, u.id, new Date("2020-01-01T00:00:00Z"));
      expect(await findSessionUser(db, "garbage")).toBeNull();
      expect(await findSessionUser(db, undefined)).toBeNull();
      expect(await findSessionUser(db, token)).toBeNull();
      expect(await db.session.count()).toBe(0);
    });

    it("выход удаляет сессию", async () => {
      const u = await mk("a@t.local");
      const { token } = await createSession(db, u.id);
      await deleteSession(db, token);
      expect(await findSessionUser(db, token)).toBeNull();
    });

    it("роль в сессии актуальна сразу после смены роли", async () => {
      const boss = await mk("boss@t.local", "super_admin");
      const u = await mk("a@t.local");
      const { token } = await createSession(db, u.id);
      expect((await findSessionUser(db, token))?.role).toBe("user");
      await changeUserRole(db, { actor: boss, targetId: u.id, newRole: "admin" });
      expect((await findSessionUser(db, token))?.role).toBe("admin");
    });
  });

  describe("смена ролей", () => {
    it("super_admin повышает и понижает, пишет аудит и уведомление", async () => {
      const boss = await mk("boss@t.local", "super_admin");
      const u = await mk("a@t.local");
      const up = await changeUserRole(db, { actor: boss, targetId: u.id, newRole: "admin" });
      expect(up.ok && up.user.role).toBe("admin");
      const down = await changeUserRole(db, { actor: boss, targetId: u.id, newRole: "user" });
      expect(down.ok && down.user.role).toBe("user");
      const audit = await db.auditLog.findMany({ where: { action: "user_role_changed", entityId: u.id }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => [a.before, a.after, a.actorId])).toEqual([
        [{ role: "user" }, { role: "admin" }, boss.id],
        [{ role: "admin" }, { role: "user" }, boss.id],
      ]);
      expect(await db.notification.count({ where: { userId: u.id, type: "role_changed" } })).toBe(2);
    });

    it("admin и user роли не меняют, ничего не записывается", async () => {
      const admin = await mk("adm@t.local", "admin");
      const guest = await mk("g@t.local");
      const target = await mk("t@t.local");
      for (const actor of [admin, guest]) {
        expect(await changeUserRole(db, { actor, targetId: target.id, newRole: "admin" })).toEqual({ ok: false, reason: "forbidden" });
      }
      expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("user");
      expect(await db.auditLog.count({ where: { action: "user_role_changed" } })).toBe(0);
    });

    it("admin не может ни понизить, ни изменить super_admin", async () => {
      const admin = await mk("adm@t.local", "admin");
      const boss = await mk("boss@t.local", "super_admin");
      const r = await changeUserRole(db, { actor: admin, targetId: boss.id, newRole: "user" });
      expect(r.ok).toBe(false);
      expect((await db.user.findUniqueOrThrow({ where: { id: boss.id } })).role).toBe("super_admin");
    });

    it("super_admin не может понизить super_admin или назначить super_admin", async () => {
      const boss = await mk("boss@t.local", "super_admin");
      const other = await mk("boss2@t.local", "super_admin");
      const u = await mk("a@t.local");
      expect(await changeUserRole(db, { actor: boss, targetId: other.id, newRole: "user" })).toEqual({ ok: false, reason: "target_is_super_admin" });
      expect(await changeUserRole(db, { actor: boss, targetId: boss.id, newRole: "user" })).toEqual({ ok: false, reason: "target_is_super_admin" });
      expect(await changeUserRole(db, { actor: boss, targetId: u.id, newRole: "super_admin" })).toEqual({ ok: false, reason: "role_not_assignable" });
    });

    it("неизвестный пользователь и та же роль", async () => {
      const boss = await mk("boss@t.local", "super_admin");
      const u = await mk("a@t.local");
      expect(await changeUserRole(db, { actor: boss, targetId: "nope", newRole: "admin" })).toEqual({ ok: false, reason: "not_found" });
      expect(await changeUserRole(db, { actor: boss, targetId: u.id, newRole: "user" })).toEqual({ ok: false, reason: "no_change" });
    });
  });
});

describe("схемы входных данных", () => {
  it("нормализует email и отбрасывает лишние поля, включая role", () => {
    const parsed = registerSchema.parse({ email: "  A@T.Local ", name: " Аня ", password: PASSWORD, role: "super_admin" });
    expect(parsed).toEqual({ email: "a@t.local", name: "Аня", password: PASSWORD });
  });

  it("отклоняет короткие, слишком длинные пароли и плохой email", () => {
    expect(registerSchema.safeParse({ email: "a@t.local", name: "A", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@t.local", name: "A", password: "я".repeat(40) }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "not-an-email", name: "A", password: PASSWORD }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@t.local", password: "" }).success).toBe(false);
  });

  it("роль в запросе — только известное значение", () => {
    expect(roleChangeSchema.safeParse({ role: "root" }).success).toBe(false);
    expect(roleChangeSchema.safeParse({ role: "admin" }).success).toBe(true);
  });
});
