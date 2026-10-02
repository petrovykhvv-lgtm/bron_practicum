import { describe, expect, it } from "vitest";
import { clientKey, LoginLimiter } from "@/lib/auth/rate-limit";
import { isSameOrigin } from "@/lib/http";

const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers });

describe("ограничение попыток входа", () => {
  it("блокирует после 5 неудач, сообщает время ожидания и снимает блок по истечении окна", () => {
    const limiter = new LoginLimiter(5, 15 * 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) limiter.fail("a|local", t0 + i);
    expect(limiter.check("a|local", t0 + 10).allowed).toBe(true);
    limiter.fail("a|local", t0 + 5);
    const blocked = limiter.check("a|local", t0 + 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(13 * 60);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(15 * 60);
    expect(limiter.check("a|local", t0 + 15 * 60_000 + 10).allowed).toBe(true);
  });

  it("успешный вход сбрасывает счётчик; пары email+клиент независимы", () => {
    const limiter = new LoginLimiter(3, 60_000);
    limiter.fail("a|local", 1);
    limiter.fail("a|local", 2);
    limiter.success("a|local");
    limiter.fail("a|local", 3);
    expect(limiter.check("a|local", 4).allowed).toBe(true);
    for (let i = 0; i < 3; i++) limiter.fail("b|local", 10 + i);
    expect(limiter.check("b|local", 20).allowed).toBe(false);
    expect(limiter.check("a|local", 20).allowed).toBe(true);
    expect(limiter.check("b|other", 20).allowed).toBe(true);
  });

  it("ключ учитывает адрес клиента из заголовков прокси", () => {
    expect(clientKey(new Headers(), "a@t.local")).toBe("a@t.local|local");
    expect(clientKey(new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }), "a@t.local")).toBe("a@t.local|10.0.0.1");
  });
});

describe("защита от CSRF", () => {
  it("пропускает тот же источник и клиентов без браузерных заголовков", () => {
    expect(isSameOrigin(req({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOrigin(req({}))).toBe(true);
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(req({ "sec-fetch-site": "none" }))).toBe(true);
  });

  it("отклоняет чужой Origin и запросы с чужого сайта без Origin", () => {
    expect(isSameOrigin(req({ host: "localhost:3000", origin: "http://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "not a url" }))).toBe(false);
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(req({ "sec-fetch-site": "same-site" }))).toBe(false);
  });
});
