import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/auth/current-user";
import { markNotificationsRead } from "@/lib/booking/service";
import { forbiddenOrigin, isSameOrigin, readJson, validationError } from "@/lib/http";

const bodySchema = z.object({ id: z.string().min(1).max(64).optional() });

// Без id — отметить все свои уведомления, с id — одно (чужое не затрагивается).
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const auth = await authorizeApi("booking:view_own");
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return validationError(parsed.error);
  const updated = await markNotificationsRead(prisma, auth.user.id, parsed.data.id);
  return NextResponse.json({ updated });
}
