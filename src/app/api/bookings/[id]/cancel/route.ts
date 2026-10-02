import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { cancelOwnBooking } from "@/lib/booking/service";
import { OWNER_CANCEL_DEADLINE_HOURS } from "@/lib/booking/rules";
import { forbiddenOrigin, isSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("booking:cancel_own");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const result = await cancelOwnBooking(prisma, {
    userId: auth.user.id,
    bookingId: id,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  if (result.ok) return NextResponse.json({ booking: result.booking });

  switch (result.reason) {
    case "not_found":
      return jsonError(404, "not_found", "Бронь не найдена");
    case "deadline_passed":
      return jsonError(
        403,
        "deadline_passed",
        `Самостоятельная отмена возможна не позднее чем за ${OWNER_CANCEL_DEADLINE_HOURS} часа до начала. Свяжитесь с рестораном.`,
      );
    case "invalid_transition":
      return jsonError(409, "invalid_transition", "Эту бронь уже нельзя отменить");
    default:
      return jsonError(409, "conflict", "Статус брони уже изменился, обновите страницу");
  }
}
