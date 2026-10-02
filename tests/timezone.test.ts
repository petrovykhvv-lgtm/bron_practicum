// Регрессия: время хранится как timestamptz и не сдвигается, даже если часовой пояс сервера PostgreSQL не UTC.
// (Драйвер Prisma читает и пишет timestamptz по поясу соединения, поэтому createPrismaClient фиксирует UTC.)
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("часовые пояса и timestamptz", () => {
  const db = createPrismaClient(url);
  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  });
  afterAll(() => db.$disconnect());

  it("сессия приложения работает в UTC", async () => {
    const [{ tz }] = await db.$queryRawUnsafe<{ tz: string }[]>("select current_setting('TimeZone') as tz");
    expect(tz).toBe("UTC");
  });

  it("записанный момент хранится в базе как тот же момент UTC и читается без сдвига", async () => {
    await db.slot.deleteMany();
    const instant = new Date("2031-03-04T12:30:00.000Z");
    const slot = await db.slot.create({ data: { startsAt: instant, isClosed: false } });
    const back = await db.slot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(back.startsAt.toISOString()).toBe(instant.toISOString());
    const [row] = await db.$queryRawUnsafe<{ utc: string }[]>(
      `select to_char("startsAt" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as utc from "Slot" where id = '${slot.id}'`,
    );
    expect(row.utc).toBe("2031-03-04T12:30:00Z");
    await db.slot.delete({ where: { id: slot.id } });
  });

  it("моменты по умолчанию (now()) совпадают с реальным временем", async () => {
    await db.notification.deleteMany();
    await db.auditLog.deleteMany();
    const before = Date.now();
    const log = await db.auditLog.create({ data: { action: "user_registered", entityType: "User", entityId: "tz-check" } });
    const diff = Math.abs(log.createdAt.getTime() - before);
    expect(diff).toBeLessThan(60_000);
    await db.auditLog.delete({ where: { id: log.id } });
  });
});
