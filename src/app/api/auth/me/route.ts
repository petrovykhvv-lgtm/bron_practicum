import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth/current-user";

export async function GET() {
  const auth = await authorizeApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ user: auth.user });
}
