import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRestaurantTz } from "@/lib/config";
import { authorizeApi } from "@/lib/auth/current-user";
import { bookingFilterSchema } from "@/lib/admin/schemas";
import { listAdminBookings } from "@/lib/admin/service";
import { jsonError, validationError } from "@/lib/http";

export async function GET(request: Request) {
  const auth = await authorizeApi("booking:view_all");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const parsed = bookingFilterSchema.safeParse({
    status: params.get("status"),
    from: params.get("from"),
    to: params.get("to"),
    page: params.get("page"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const result = await listAdminBookings(prisma, { id: auth.user.id, role: auth.user.role }, parsed.data, getRestaurantTz());
  if (!result.ok) return jsonError(403, "forbidden", "Недостаточно прав для этого действия");
  return NextResponse.json(result.data);
}
