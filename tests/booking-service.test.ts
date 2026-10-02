// Интеграционные тесты сценария бронирования на тестовой БД (TEST_DATABASE_URL); без неё пропускаются.
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";
import {
  cancelOwnBooking,
  countUnread,
  createBooking,
  getAvailableWindows,
  listNotifications,
  listUserBookings,
  markNotificationsRead,
} from "@/lib/booking/service";
import { createBookingSchema, availabilityQuerySchema } from "@/lib/booking/schemas";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const TZ = "Europe/Moscow";
const NOW = new Date("2026-10-07T07:00:00Z"); // среда, 10:00 по Москве
const at = (iso: string) => new Date(iso);
// Четверг 2026-10-08, 12:00 и 13:30 по Москве
const THU_12 = at("2026-10-08T09:00:00Z");
const THU_1330 = at("2026-10-08T10:30:00Z");

run("бронирование: сервис", () => {
  const db = createPrismaClient(url);
  let u1 = "", u2 = "", u3 = "";

  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  });

  async function setup(capacities: number[]) {
    await db.notification.deleteMany();
    await db.auditLog.deleteMany();
    await db.booking.deleteMany();
    await db.slot.deleteMany();
    await db.table.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    u1 = (await db.user.create({ data: { email: "a@t.local", name: "A", passwordHash: "x" } })).id;
    u2 = (await db.user.create({ data: { email: "b@t.local", name: "B", passwordHash: "x" } })).id;
    u3 = (await db.user.create({ data: { email: "c@t.local", name: "C", passwordHash: "x" } })).id;
    for (const [i, capacity] of capacities.entries()) {
      await db.table.create({ data: { name: `Стол ${i + 1}`, capacity } });
    }
  }
  beforeEach(() => setup([2, 4, 8]));
  afterAll(() => db.$disconnect());

  const book = (userId: string, startsAt: Date, partySize = 2, now = NOW) =>
    createBooking(db, { userId, startsAt, partySize, now, timeZone: TZ });

  describe("доступные окна", () => {
    it("считаются по правилам: сетка, горизонт, без прошлого и понедельников", async () => {
      const windows = await getAvailableWindows(db, { partySize: 2, now: NOW, timeZone: TZ });
      expect(windows[0].startsAt).toBe("2026-10-07T09:00:00.000Z"); // 12:00 сегодня
      expect(windows.every((w) => new Date(w.startsAt) > NOW)).toBe(true);
      expect(new Set(windows.map((w) => w.time))).toEqual(new Set(["12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"]));
      expect(windows.some((w) => w.date === "2026-10-12")).toBe(false); // понедельник
      expect(windows.some((w) => w.date === "2026-10-21")).toBe(false); // дальше горизонта
    });

    it("скрывают окно без подходящего стола и окна, закрытые администратором", async () => {
      expect((await getAvailableWindows(db, { partySize: 9 as number, now: NOW, timeZone: TZ }))).toEqual([]);
      const before = await getAvailableWindows(db, { partySize: 8, now: NOW, timeZone: TZ });
      await book(u1, THU_12, 8);
      const after = await getAvailableWindows(db, { partySize: 8, now: NOW, timeZone: TZ });
      expect(after.length).toBe(before.length - 1);
      expect(after.some((w) => w.startsAt === THU_12.toISOString())).toBe(false);

      await db.slot.create({ data: { startsAt: THU_1330, isClosed: true } });
      const closed = await getAvailableWindows(db, { partySize: 2, now: NOW, timeZone: TZ });
      expect(closed.some((w) => w.startsAt === THU_1330.toISOString())).toBe(false);
    });

    it("не показывают пользователю окна, где у него уже есть активная бронь", async () => {
      await book(u1, THU_12);
      const mine = await getAvailableWindows(db, { partySize: 2, userId: u1, now: NOW, timeZone: TZ });
      const other = await getAvailableWindows(db, { partySize: 2, userId: u2, now: NOW, timeZone: TZ });
      expect(mine.some((w) => w.startsAt === THU_12.toISOString())).toBe(false);
      expect(other.some((w) => w.startsAt === THU_12.toISOString())).toBe(true);
    });
  });

  describe("создание брони", () => {
    it("создаёт pending с назначенным столом наименьшей подходящей вместимости, аудитом и уведомлением", async () => {
      const r = await book(u1, THU_12, 3);
      if (!r.ok) throw new Error(r.reason);
      expect(r.booking.status).toBe("pending");
      expect(r.booking.tableName).toBe("Стол 2"); // вместимость 4 — наименьший из подходящих для 3
      const row = await db.booking.findUniqueOrThrow({ where: { id: r.booking.id }, include: { table: true } });
      expect(row.table.capacity).toBeGreaterThanOrEqual(3);
      expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(90 * 60_000);
      expect(await db.auditLog.count({ where: { action: "booking_created", entityId: row.id, actorId: u1 } })).toBe(1);
      const notes = await listNotifications(db, u1);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: "booking_created", read: false });
    });

    it("отклоняет прошедшее время, время вне сетки, понедельник и дату вне горизонта", async () => {
      const cases = [
        at("2026-10-07T04:00:00Z"), // сегодня 07:00? до открытия и в прошлом
        at("2026-10-07T06:00:00Z"), // 09:00 по Москве: прошло/не в сетке
        at("2026-10-08T09:30:00Z"), // 12:30 — вне сетки
        at("2026-10-12T09:00:00Z"), // понедельник 12:00
        at("2026-10-21T09:00:00Z"), // 15-й день
      ];
      for (const c of cases) {
        expect(await book(u1, c)).toEqual({ ok: false, reason: "window_unavailable" });
      }
      expect(await db.booking.count()).toBe(0);
    });

    it("отклоняет закрытое администратором окно и недопустимое число гостей", async () => {
      await db.slot.create({ data: { startsAt: THU_12, isClosed: true } });
      expect(await book(u1, THU_12)).toEqual({ ok: false, reason: "window_unavailable" });
      expect(await book(u1, THU_1330, 0)).toEqual({ ok: false, reason: "invalid_party_size" });
      expect(await book(u1, THU_1330, 9)).toEqual({ ok: false, reason: "invalid_party_size" });
    });

    it("не создаёт вторую активную бронь пользователя на то же время", async () => {
      expect((await book(u1, THU_12)).ok).toBe(true);
      expect(await book(u1, THU_12)).toEqual({ ok: false, reason: "user_conflict" });
      expect((await book(u1, THU_1330)).ok).toBe(true); // соседнее окно допустимо
    });

    it("отказывает, когда нет подходящего свободного стола", async () => {
      expect((await book(u1, THU_12, 8)).ok).toBe(true); // единственный стол на 8
      expect(await book(u2, THU_12, 8)).toEqual({ ok: false, reason: "no_table" });
    });

    it("при занятом малом столе берёт следующий по вместимости", async () => {
      const a = await book(u1, THU_12, 2);
      const b = await book(u2, THU_12, 2);
      const c = await book(u3, THU_12, 2);
      expect([a, b, c].map((r) => (r.ok ? r.booking.tableName : r.reason))).toEqual(["Стол 1", "Стол 2", "Стол 3"]);
    });

    it("отменённая бронь освобождает стол и пользователя", async () => {
      const first = await book(u1, THU_12, 8);
      if (!first.ok) throw new Error();
      expect((await cancelOwnBooking(db, { userId: u1, bookingId: first.booking.id, now: NOW, timeZone: TZ })).ok).toBe(true);
      expect((await book(u2, THU_12, 8)).ok).toBe(true);
      expect((await book(u1, THU_12, 2)).ok).toBe(true);
    });
  });

  describe("гонки одновременных запросов", () => {
    it("два пользователя на единственный стол: успех ровно у одного", async () => {
      await setup([2]);
      const results = await Promise.all([book(u1, THU_12), book(u2, THU_12)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.booking.count({ where: { startsAt: THU_12 } })).toBe(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: expect.stringMatching(/^(no_table|busy)$/) });
    });

    it("один пользователь шлёт запрос дважды: бронь одна", async () => {
      const results = await Promise.all([book(u1, THU_12), book(u1, THU_12), book(u1, THU_12)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.booking.count({ where: { userId: u1 } })).toBe(1);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "user_conflict")).toBe(true);
    });

    it("несколько пользователей на несколько столов: каждому свой стол без пересечений", async () => {
      await setup([2, 2]);
      const results = await Promise.all([book(u1, THU_12), book(u2, THU_12), book(u3, THU_12)]);
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      const rows = await db.booking.findMany({ where: { startsAt: THU_12 } });
      expect(new Set(rows.map((r) => r.tableId)).size).toBe(2);
    });
  });

  describe("нагрузка на гонки", () => {
    it("шесть одновременных запросов на три стола: ровно три успеха, остальные — понятные отказы", async () => {
      const extra: string[] = [];
      for (let i = 0; i < 3; i++) extra.push((await db.user.create({ data: { email: `x${i}@t.local`, name: "X", passwordHash: "x" } })).id);
      const users = [u1, u2, u3, ...extra];
      const results = await Promise.all(users.map((id) => book(id, THU_12, 2)));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      for (const r of results.filter((x) => !x.ok)) expect(["no_table", "busy"]).toContain((r as { reason: string }).reason);
      const rows = await db.booking.findMany({ where: { startsAt: THU_12 } });
      expect(new Set(rows.map((r) => r.tableId)).size).toBe(rows.length);
    });
  });

  describe("мои брони и отмена", () => {
    it("пользователь видит только свои брони со столом и признаком отмены", async () => {
      await book(u1, THU_12);
      await book(u2, THU_1330);
      const mine = await listUserBookings(db, u1, NOW, TZ);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ status: "pending", tableName: "Стол 1", canCancel: true });
      expect(Object.keys(mine[0])).not.toContain("userId");
    });

    it("отмена разрешена не позднее чем за 3 часа, после — нет", async () => {
      const r = await book(u1, THU_12);
      if (!r.ok) throw new Error();
      const id = r.booking.id;
      // начало 12:00 МСК = 09:00Z, дедлайн 06:00Z
      expect(await cancelOwnBooking(db, { userId: u1, bookingId: id, now: at("2026-10-08T06:00:01Z"), timeZone: TZ })).toEqual({ ok: false, reason: "deadline_passed" });
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("pending");
      const ok = await cancelOwnBooking(db, { userId: u1, bookingId: id, now: at("2026-10-08T06:00:00Z"), timeZone: TZ });
      expect(ok.ok && ok.booking.status).toBe("cancelled");
    });

    it("после отмены пишутся аудит и уведомление, повторная отмена отклоняется", async () => {
      const r = await book(u1, THU_12);
      if (!r.ok) throw new Error();
      await cancelOwnBooking(db, { userId: u1, bookingId: r.booking.id, now: NOW, timeZone: TZ });
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "booking_status_changed", entityId: r.booking.id } });
      expect([audit.before, audit.after, audit.actorId]).toEqual([{ status: "pending" }, { status: "cancelled" }, u1]);
      expect((await listNotifications(db, u1)).map((n) => n.type).sort()).toEqual(["booking_cancelled", "booking_created"]);
      expect(await cancelOwnBooking(db, { userId: u1, bookingId: r.booking.id, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it("чужую бронь отменить нельзя и существование брони не раскрывается", async () => {
      const r = await book(u1, THU_12);
      if (!r.ok) throw new Error();
      expect(await cancelOwnBooking(db, { userId: u2, bookingId: r.booking.id, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "not_found" });
      expect(await cancelOwnBooking(db, { userId: u1, bookingId: "missing", now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "not_found" });
      expect((await db.booking.findUniqueOrThrow({ where: { id: r.booking.id } })).status).toBe("pending");
    });

    it("подтверждённую бронь тоже можно отменить до дедлайна, завершённую и no_show нельзя", async () => {
      const r = await book(u1, THU_12);
      const r2 = await book(u2, THU_1330);
      if (!r.ok || !r2.ok) throw new Error();
      await db.booking.update({ where: { id: r.booking.id }, data: { status: "confirmed" } });
      await db.booking.update({ where: { id: r2.booking.id }, data: { status: "no_show" } });
      expect((await cancelOwnBooking(db, { userId: u1, bookingId: r.booking.id, now: NOW, timeZone: TZ })).ok).toBe(true);
      expect(await cancelOwnBooking(db, { userId: u2, bookingId: r2.booking.id, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "invalid_transition" });
    });
  });

  describe("уведомления", () => {
    it("считают непрочитанные и отмечают только свои", async () => {
      await book(u1, THU_12);
      await book(u2, THU_1330);
      expect(await countUnread(db, u1)).toBe(1);
      const mineId = (await listNotifications(db, u1))[0].id;
      expect(await markNotificationsRead(db, u2, mineId)).toBe(0); // чужое не затрагивается
      expect(await countUnread(db, u1)).toBe(1);
      expect(await markNotificationsRead(db, u1, mineId)).toBe(1);
      expect(await countUnread(db, u1)).toBe(0);
      expect(await countUnread(db, u2)).toBe(1);
      expect(await markNotificationsRead(db, u2)).toBe(1);
    });
  });
});

describe("схемы бронирования", () => {
  it("число гостей ограничено теми же границами 1–8", () => {
    const ok = { startsAt: "2026-10-08T09:00:00.000Z", partySize: 4 };
    expect(createBookingSchema.safeParse(ok).success).toBe(true);
    expect(createBookingSchema.safeParse({ ...ok, partySize: 0 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...ok, partySize: 9 }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...ok, partySize: "4" }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...ok, startsAt: "завтра" }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...ok, comment: "x".repeat(301) }).success).toBe(false);
    expect(availabilityQuerySchema.safeParse({ partySize: "3" }).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ partySize: "9" }).success).toBe(false);
    expect(availabilityQuerySchema.safeParse({ partySize: null }).success).toBe(false);
  });

  it("не принимает чужие поля: userId, tableId и status отбрасываются", () => {
    const parsed = createBookingSchema.parse({
      startsAt: "2026-10-08T09:00:00.000Z",
      partySize: 2,
      userId: "other",
      tableId: "t1",
      status: "confirmed",
    });
    expect(Object.keys(parsed).sort()).toEqual(["partySize", "startsAt"]);
  });
});
