import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/auth/service";

export async function GET() {
  const auth = await authorizeApi("user:list");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ users: await listUsers(prisma) });
}
