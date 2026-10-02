import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return jsonError(400, "validation_error", "Проверьте введённые данные", fields);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// Защита от CSRF для изменяющих запросов. Браузер всегда присылает Origin (он должен совпасть с хостом сервиса)
// или хотя бы Sec-Fetch-Site (запрос с чужого сайта отклоняется). Клиенты без этих заголовков (curl, скрипты)
// браузерную cookie-сессию подделать не могут, их пропускаем.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === request.headers.get("host");
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

export function forbiddenOrigin() {
  return jsonError(403, "bad_origin", "Запрос с чужого источника отклонён");
}
