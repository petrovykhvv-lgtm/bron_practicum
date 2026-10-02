import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { auditQuerySchema } from "@/lib/admin/schemas";
import { listAudit } from "@/lib/admin/service";
import { jsonError, validationError } from "@/lib/http";

// Admin видит историю броней и окон; смену ролей и регистрации — только super_admin (фильтруется в сервисе).
export async function GET(request: Request) {
  const auth = await authorizeApi("audit:view_bookings");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const parsed = auditQuerySchema.safeParse({
    entityType: params.get("entityType"),
    entityId: params.get("entityId"),
    limit: params.get("limit"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const result = await listAudit(prisma, { id: auth.user.id, role: auth.user.role }, parsed.data, getRestaurantTz());
  if (!result.ok) return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  return NextResponse.json({ entries: result.data });
}
