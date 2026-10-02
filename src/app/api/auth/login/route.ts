import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/auth/schemas";
import { authenticate } from "@/lib/auth/service";
import { clientKey, loginLimiter } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/current-user";
import { forbiddenOrigin, isSameOrigin, jsonError, readJson, validationError } from "@/lib/http";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin();
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // Подбор пароля: после 5 неудач подряд вход для пары «email + клиент» закрывается на 15 минут.
  const key = clientKey(request.headers, parsed.data.email);
  const limit = loginLimiter.check(key);
  if (!limit.allowed) {
    const response = jsonError(429, "too_many_attempts", `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(limit.retryAfterSec / 60)} мин.`);
    response.headers.set("Retry-After", String(limit.retryAfterSec));
    return response;
  }

  const user = await authenticate(prisma, parsed.data);
  // Одинаковый ответ для неверного пароля и несуществующего email.
  if (!user) {
    loginLimiter.fail(key);
    return jsonError(401, "invalid_credentials", "Неверный email или пароль");
  }
  loginLimiter.success(key);

  await startSession(user.id);
  return NextResponse.json({ user });
}
