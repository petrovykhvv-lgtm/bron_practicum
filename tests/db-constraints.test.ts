// Интеграционная проверка защиты от дублей на уровне PostgreSQL.
// Нужна отдельная БД: TEST_DATABASE_URL (миграции применяются командой ниже). Без неё тесты пропускаются.
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("ограничения БД", () => {
  const prisma = createPrismaClient(url);
  const start = new Date("2030-01-08T09:00:00Z");
  const end = new Date("2030-01-08T10:30:00Z");
  const nextStart = new Date("2030-01-08T10:30:00Z");
  const nextEnd = new Date("2030-01-08T12:00:00Z");
  let u1 = "", u2 = "", t2a = "", t2b = "", t4 = "";

  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.table.deleteMany();
    await prisma.user.deleteMany();
    u1 = (await prisma.user.create({ data: { email: "a@t.local", name: "A", passwordHash: "x" } })).id;
    u2 = (await prisma.user.create({ data: { email: "b@t.local", name: "B", passwordHash: "x" } })).id;
    t2a = (await prisma.table.create({ data: { name: "T2a", capacity: 2 } })).id;
    t2b = (await prisma.table.create({ data: { name: "T2b", capacity: 2 } })).id;
    t4 = (await prisma.table.create({ data: { name: "T4", capacity: 4 } })).id;
  });

  afterAll(() => prisma.$disconnect());

  const book = (userId: string, tableId: string, s = start, e = end, partySize = 2, status: "pending" | "cancelled" = "pending") =>
    prisma.booking.create({ data: { userId, tableId, startsAt: s, endsAt: e, partySize, status } });

  it("не даёт назначить один стол двум активным броням на то же окно", async () => {
    await book(u1, t2a);
    await expect(book(u2, t2a)).rejects.toThrow();
  });

  it("не даёт пересечение со сдвигом, но разрешает соседнее окно", async () => {
    await book(u1, t2a);
    await expect(book(u2, t2a, new Date("2030-01-08T10:00:00Z"), new Date("2030-01-08T11:30:00Z"))).rejects.toThrow();
    await expect(book(u2, t2a, nextStart, nextEnd)).resolves.toBeTruthy();
  });

  it("не даёт пользователю две активные брони на одно время (на разных столах)", async () => {
    await book(u1, t2a);
    await expect(book(u1, t2b)).rejects.toThrow();
  });

  it("отменённая бронь не блокирует ни стол, ни пользователя", async () => {
    await book(u1, t2a, start, end, 2, "cancelled");
    await expect(book(u1, t2a)).resolves.toBeTruthy();
  });

  it("при отмене активной брони стол освобождается", async () => {
    const b = await book(u1, t2a);
    await prisma.booking.update({ where: { id: b.id }, data: { status: "cancelled" } });
    await expect(book(u2, t2a)).resolves.toBeTruthy();
  });

  it("не принимает компанию больше вместимости стола", async () => {
    await expect(book(u1, t2a, start, end, 3)).rejects.toThrow();
    await expect(book(u1, t4, start, end, 4)).resolves.toBeTruthy();
  });

  it("не принимает неверные значения времени и числа гостей", async () => {
    await expect(book(u1, t4, end, start)).rejects.toThrow();
    await expect(book(u1, t4, start, end, 0)).rejects.toThrow();
    await expect(book(u1, t4, start, end, 9)).rejects.toThrow();
  });

  it("не принимает бронь на неактивный стол", async () => {
    await prisma.table.update({ where: { id: t2b }, data: { isActive: false } });
    await expect(book(u1, t2b)).rejects.toThrow();
  });
});
