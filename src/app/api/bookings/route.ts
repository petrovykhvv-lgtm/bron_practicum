import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { createBookingSchema } from "@/lib/booking/schemas";
import { createBooking, listUserBookings } from "@/lib/booking/service";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function GET() {
  const auth = await authorizeApi("booking:view_own");
  if (!auth.ok) return auth.response;
  const bookings = await listUserBookings(prisma, auth.user.id, new Date(), getRestaurantTz());
  return NextResponse.json({ bookings });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("booking:create");
  if (!auth.ok) return auth.response;

  const parsed = createBookingSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await createBooking(prisma, {
    userId: auth.user.id,
    startsAt: new Date(parsed.data.startsAt),
    partySize: parsed.data.partySize,
    comment: parsed.data.comment,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  if (result.ok) return NextResponse.json({ booking: result.booking }, { status: 201 });

  switch (result.reason) {
    case "invalid_party_size":
      return jsonError(400, "invalid_party_size", "Недопустимое число гостей");
    case "window_unavailable":
      return jsonError(409, "window_unavailable", "Это время недоступно для бронирования. Выберите другое.");
    case "user_conflict":
      return jsonError(409, "user_conflict", "У вас уже есть бронь на это время");
    case "no_table":
      return jsonError(409, "no_table", "На это время нет свободного стола для вашей компании");
    default:
      return jsonError(409, "busy", "Не удалось занять стол, попробуйте ещё раз");
  }
}
