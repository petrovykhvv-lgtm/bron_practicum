// Ограничение подбора пароля: не больше MAX неудачных попыток входа за окно WINDOW для пары «email + адрес клиента».
// Счётчики живут в памяти процесса: для локального запуска этого достаточно, перезапуск сервера их сбрасывает.
export interface LimitState {
  allowed: boolean;
  retryAfterSec: number;
}

export class LoginLimiter {
  private entries = new Map<string, { count: number; first: number }>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  check(key: string, now = Date.now()): LimitState {
    const entry = this.entries.get(key);
    if (!entry) return { allowed: true, retryAfterSec: 0 };
    if (now - entry.first >= this.windowMs) {
      this.entries.delete(key);
      return { allowed: true, retryAfterSec: 0 };
    }
    if (entry.count < this.max) return { allowed: true, retryAfterSec: 0 };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.first + this.windowMs - now) / 1000)) };
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.entries.get(key);
    if (!entry || now - entry.first >= this.windowMs) this.entries.set(key, { count: 1, first: now });
    else entry.count += 1;
    if (this.entries.size > 5000) this.prune(now);
  }

  success(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (now - entry.first >= this.windowMs) this.entries.delete(key);
  }
}

// Один счётчик на процесс; globalThis сохраняет его при горячей перезагрузке в dev-режиме.
const store = globalThis as unknown as { __vmLoginLimiter?: LoginLimiter };
export const loginLimiter = (store.__vmLoginLimiter ??= new LoginLimiter());

export function clientKey(headers: Headers, email: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
  return `${email}|${forwarded}`;
}
