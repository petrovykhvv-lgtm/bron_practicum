import { describe, expect, it } from "vitest";
import { can, checkRoleChange, PERMISSION_MATRIX, PUBLIC_USER_SELECT } from "@/lib/permissions";
import { BCRYPT_SALT_ROUNDS, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("матрица ролей", () => {
  it("user работает только со своими бронями", () => {
    expect(can("user", "booking:create")).toBe(true);
    expect(can("user", "booking:cancel_own")).toBe(true);
    for (const p of ["booking:view_all", "booking:change_status", "slot:manage", "user:list", "user:change_role", "audit:view_all"] as const) {
      expect(can("user", p)).toBe(false);
    }
  });

  it("admin управляет бронями и окнами, но не ролями", () => {
    expect(can("admin", "booking:change_status")).toBe(true);
    expect(can("admin", "slot:manage")).toBe(true);
    expect(can("admin", "user:list")).toBe(true);
    expect(can("admin", "user:change_role")).toBe(false);
    expect(can("admin", "audit:view_all")).toBe(false);
  });

  it("super_admin имеет всё, что и admin, плюс роли и полный аудит", () => {
    for (const p of PERMISSION_MATRIX.admin) expect(can("super_admin", p)).toBe(true);
    expect(can("super_admin", "user:change_role")).toBe(true);
    expect(can("super_admin", "audit:view_all")).toBe(true);
  });
});

describe("смена ролей", () => {
  it("super_admin повышает user до admin и понижает обратно", () => {
    expect(checkRoleChange({ actorRole: "super_admin", targetRole: "user", newRole: "admin" }).ok).toBe(true);
    expect(checkRoleChange({ actorRole: "super_admin", targetRole: "admin", newRole: "user" }).ok).toBe(true);
  });

  it("admin и user роли не меняют", () => {
    expect(checkRoleChange({ actorRole: "admin", targetRole: "user", newRole: "admin" })).toEqual({ ok: false, reason: "forbidden" });
    expect(checkRoleChange({ actorRole: "user", targetRole: "user", newRole: "admin" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("роль super_admin нельзя ни снять, ни назначить", () => {
    expect(checkRoleChange({ actorRole: "admin", targetRole: "super_admin", newRole: "user" }).ok).toBe(false);
    expect(checkRoleChange({ actorRole: "super_admin", targetRole: "super_admin", newRole: "user" })).toEqual({ ok: false, reason: "target_is_super_admin" });
    expect(checkRoleChange({ actorRole: "super_admin", targetRole: "admin", newRole: "super_admin" })).toEqual({ ok: false, reason: "role_not_assignable" });
  });

  it("не принимает смену на ту же роль", () => {
    expect(checkRoleChange({ actorRole: "super_admin", targetRole: "admin", newRole: "admin" })).toEqual({ ok: false, reason: "no_change" });
  });
});

describe("пароли и публичный профиль", () => {
  it("публичная выборка не содержит passwordHash", () => {
    expect(Object.keys(PUBLIC_USER_SELECT)).not.toContain("passwordHash");
  });

  it("хеш bcrypt с 12 раундами проверяется через compare", async () => {
    const hash = await hashPassword("Test-Password-1");
    expect(BCRYPT_SALT_ROUNDS).toBe(12);
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.split("$")[2]).toBe("12");
    expect(hash).not.toContain("Test-Password-1");
    expect(await verifyPassword("Test-Password-1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
