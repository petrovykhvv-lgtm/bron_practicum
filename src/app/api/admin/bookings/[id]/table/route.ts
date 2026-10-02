import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { tableChangeSchema } from "@/lib/admin/schemas";
import { changeBookingTable } from "@/lib/admin/service";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

// Пересадка: сменить стол у активной брони. Свободность стола и вместимость проверяет сервер, а затем и БД.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/bookings/[id]/table">) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("booking:assign_table");
  if (!auth.ok) return auth.response;

  const parsed = tableChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { id } = await ctx.params;
  const result = await changeBookingTable(prisma, {
    actor: { id: auth.user.id, role: auth.user.role },
    bookingId: id,
    tableId: parsed.data.tableId,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  if (result.ok) return NextResponse.json({ tableName: result.tableName });

  switch (result.reason) {
    case "not_found":
      return jsonError(404, "not_found", "Бронь не найдена");
    case "table_not_found":
      return jsonError(404, "table_not_found", "Такого стола нет");
    case "not_active":
      return jsonError(409, "not_active", "Стол можно менять только у ожидающей или подтверждённой брони");
    case "past":
      return jsonError(409, "past", "Бронь уже прошла: стол не меняется");
    case "table_inactive":
      return jsonError(409, "table_inactive", "Этот стол не используется");
    case "too_small":
      return jsonError(409, "too_small", "Стол мал для этой компании");
    case "table_busy":
      return jsonError(409, "table_busy", "На это время стол уже занят");
    case "no_change":
      return jsonError(409, "no_change", "Бронь уже за этим столом");
    default:
      return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  }
}
