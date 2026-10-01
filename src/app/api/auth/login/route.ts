import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/auth/schemas";
import { authenticate } from "@/lib/auth/service";
import { startSession } from "@/lib/auth/current-user";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const user = await authenticate(prisma, parsed.data);
  // Одинаковый ответ для неверного пароля и несуществующего email.
  if (!user) return jsonError(401, "invalid_credentials", "Неверный email или пароль");

  await startSession(user.id);
  return NextResponse.json({ user });
}
