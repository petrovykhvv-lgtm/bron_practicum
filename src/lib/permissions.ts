import type { Role } from "@/generated/prisma/client";

// Матрица ролей (SPEC.md, раздел 4). Любая серверная операция сверяется с ней.
export type Permission =
  | "booking:create"
  | "booking:view_own"
  | "booking:cancel_own"
  | "booking:view_all"
  | "booking:change_status"
  | "booking:assign_table"
  | "slot:manage"
  | "user:list"
  | "user:change_role"
  | "audit:view_bookings"
  | "audit:view_all";

const USER_PERMISSIONS: Permission[] = [
  "booking:create",
  "booking:view_own",
  "booking:cancel_own",
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...USER_PERMISSIONS,
  "booking:view_all",
  "booking:change_status",
  "booking:assign_table",
  "slot:manage",
  "user:list",
  "audit:view_bookings",
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  "user:change_role",
  "audit:view_all",
];

export const PERMISSION_MATRIX: Record<Role, ReadonlySet<Permission>> = {
  user: new Set(USER_PERMISSIONS),
  admin: new Set(ADMIN_PERMISSIONS),
  super_admin: new Set(SUPER_ADMIN_PERMISSIONS),
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSION_MATRIX[role].has(permission);
}

// Какие сущности истории видит роль: admin — брони и окна записи, super_admin — ещё пользователей и роли.
export const AUDIT_ENTITY_TYPES: Record<Role, readonly string[]> = {
  user: [],
  admin: ["Booking", "Slot"],
  super_admin: ["Booking", "Slot", "User"],
};

// Описание возможностей для интерфейса: те же права, что проверяет сервер.
export const CAPABILITIES: { permission: Permission; label: string }[] = [
  { permission: "booking:view_all", label: "Видеть все бронирования и фильтровать их" },
  { permission: "booking:change_status", label: "Подтверждать, отменять, завершать брони и отмечать «не пришёл»" },
  { permission: "booking:assign_table", label: "Пересаживать гостей: менять стол у активной брони" },
  { permission: "slot:manage", label: "Закрывать и открывать окна записи" },
  { permission: "user:list", label: "Видеть список пользователей" },
  { permission: "audit:view_bookings", label: "Смотреть историю броней и окон" },
  { permission: "user:change_role", label: "Повышать пользователя до администратора и понижать обратно" },
  { permission: "audit:view_all", label: "Смотреть историю смены ролей и регистраций" },
];

export const ASSIGNABLE_ROLES: Role[] = ["user", "admin"];

export type RoleChangeResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "target_is_super_admin" | "role_not_assignable" | "no_change" };

// super_admin может переключать user <-> admin. Роль super_admin не назначается и не снимается через приложение.
export function checkRoleChange(input: {
  actorRole: Role;
  targetRole: Role;
  newRole: Role;
}): RoleChangeResult {
  const { actorRole, targetRole, newRole } = input;
  if (!can(actorRole, "user:change_role")) return { ok: false, reason: "forbidden" };
  if (targetRole === "super_admin") return { ok: false, reason: "target_is_super_admin" };
  if (!ASSIGNABLE_ROLES.includes(newRole)) return { ok: false, reason: "role_not_assignable" };
  if (targetRole === newRole) return { ok: false, reason: "no_change" };
  return { ok: true };
}

// Просмотр пользователя без секретов. passwordHash не должен покидать серверный слой.
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;
