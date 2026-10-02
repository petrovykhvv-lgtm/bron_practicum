import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { statusChangeSchema } from "@/lib/admin/schemas";
import { changeBookingStatus } from "@/lib/admin/service";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/admin/bookings/[id]/status">) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("booking:change_status");
  if (!auth.ok) return auth.response;

  const parsed = statusChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await ctx.params;
  const result = await changeBookingStatus(prisma, {
    actor: { id: auth.user.id, role: auth.user.role },
    bookingId: id,
    to: parsed.data.status,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  if (result.ok) return NextResponse.json({ status: result.status });

  switch (result.reason) {
    case "not_found":
      return jsonError(404, "not_found", "Бронь не найдена");
    case "invalid_transition":
      return jsonError(409, "invalid_transition", "Такой переход статуса недопустим");
    case "too_early":
      return jsonError(409, "too_early", "Завершить бронь или отметить «не пришёл» можно после её начала");
    case "stale":
      return jsonError(409, "conflict", "Статус брони уже изменился, обновите страницу");
    default:
      return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  }
}
