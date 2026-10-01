import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/auth/schemas";
import { registerUser } from "@/lib/auth/service";
import { startSession } from "@/lib/auth/current-user";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const parsed = registerSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const result = await registerUser(prisma, parsed.data);
  if (!result.ok) return jsonError(409, "email_taken", "Этот email уже зарегистрирован");

  await startSession(result.user.id);
  return NextResponse.json({ user: result.user }, { status: 201 });
}
