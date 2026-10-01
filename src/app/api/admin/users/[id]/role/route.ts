import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/auth/current-user";
import { roleChangeSchema } from "@/lib/auth/schemas";
import { changeUserRole } from "@/lib/auth/service";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/users/[id]/role">) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("user:change_role");
  if (!auth.ok) return auth.response;

  const parsed = roleChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await ctx.params;
  const result = await changeUserRole(prisma, {
    actor: { id: auth.user.id, role: auth.user.role },
    targetId: id,
    newRole: parsed.data.role,
  });
  if (result.ok) return NextResponse.json({ user: result.user });

  switch (result.reason) {
    case "not_found":
      return jsonError(404, "not_found", "Пользователь не найден");
    case "target_is_super_admin":
      return jsonError(403, "target_is_super_admin", "Роль суперадминистратора изменить нельзя");
    case "role_not_assignable":
      return jsonError(403, "role_not_assignable", "Эту роль назначить нельзя");
    case "no_change":
      return jsonError(409, "no_change", "У пользователя уже эта роль");
    case "stale":
      return jsonError(409, "conflict", "Роль уже изменилась, обновите страницу");
    default:
      return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  }
}
