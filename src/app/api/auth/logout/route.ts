import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/current-user";
import { forbiddenOrigin, isSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  await endSession();
  return NextResponse.json({ ok: true });
}
