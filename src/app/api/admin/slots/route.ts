import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { slotChangeSchema } from "@/lib/admin/schemas";
import { getSlotSchedule, setSlotClosed } from "@/lib/admin/service";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function GET() {
  const auth = await authorizeApi("slot:manage");
  if (!auth.ok) return auth.response;
  const result = await getSlotSchedule(prisma, { id: auth.user.id, role: auth.user.role }, new Date(), getRestaurantTz());
  if (!result.ok) return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  return NextResponse.json({ slots: result.data });
}

// Закрыть или открыть окно: { startsAt, closed, reason? }
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("slot:manage");
  if (!auth.ok) return auth.response;

  const parsed = slotChangeSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await setSlotClosed(prisma, {
    actor: { id: auth.user.id, role: auth.user.role },
    startsAt: new Date(parsed.data.startsAt),
    closed: parsed.data.closed,
    reason: parsed.data.reason,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  if (result.ok) return NextResponse.json({ closed: result.closed, activeBookings: result.activeBookings });

  switch (result.reason) {
    case "invalid_window":
      return jsonError(400, "invalid_window", "Такого окна записи нет: выберите окно из расписания");
    case "no_change":
      return jsonError(409, "no_change", "Окно уже в таком состоянии");
    default:
      return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  }
}
