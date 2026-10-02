import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/auth/current-user";
import { countUnread, listNotifications } from "@/lib/booking/service";

export async function GET() {
  const auth = await authorizeApi("booking:view_own");
  if (!auth.ok) return auth.response;
  const [notifications, unread] = await Promise.all([
    listNotifications(prisma, auth.user.id),
    countUnread(prisma, auth.user.id),
  ]);
  return NextResponse.json({ notifications, unread });
}
