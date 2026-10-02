import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { availabilityQuerySchema } from "@/lib/booking/schemas";
import { getAvailableWindows } from "@/lib/booking/service";
import { validationError } from "@/lib/http";

// Окна считаются по правилам при каждом запросе. Для залогиненного пользователя
// исключаются окна, где у него уже есть активная бронь.
export async function GET(request: Request) {
  const parsed = availabilityQuerySchema.safeParse({
    partySize: new URL(request.url).searchParams.get("partySize"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const user = await getCurrentUser();
  const windows = await getAvailableWindows(prisma, {
    partySize: parsed.data.partySize,
    userId: user?.id,
    now: new Date(),
    timeZone: getRestaurantTz(),
  });
  return NextResponse.json({ windows });
}
