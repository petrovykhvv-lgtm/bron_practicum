// Постраничный вывод, пересадка гостей и план зала на тестовой БД (TEST_DATABASE_URL).
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";
import { createBooking } from "@/lib/booking/service";
import {
  changeBookingStatus,
  changeBookingTable,
  getFloorPlan,
  listAdminBookings,
  listAudit,
  listAuditPage,
  setSlotClosed,
  type Actor,
} from "@/lib/admin/service";
import { describeAudit } from "@/lib/admin/audit-describe";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const TZ = "Europe/Moscow";
const NOW = new Date("2026-10-07T07:00:00Z"); // среда 10:00 МСК
const at = (iso: string) => new Date(iso);
// Четверг 2026-10-08 по Москве
const THU = {
  w12: at("2026-10-08T09:00:00Z"),
  w1330: at("2026-10-08T10:30:00Z"),
  w15: at("2026-10-08T12:00:00Z"),
  w1630: at("2026-10-08T13:30:00Z"),
  w18: at("2026-10-08T15:00:00Z"),
};

run("пересадка, страницы и план зала", () => {
  const db = createPrismaClient(url);
  let g1 = "", g2 = "", g3 = "";
  let admin: Actor, boss: Actor, guest: Actor;
  let t: Record<string, string> = {};

  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  });
  beforeEach(async () => {
    await db.notification.deleteMany();
    await db.auditLog.deleteMany();
    await db.booking.deleteMany();
    await db.slot.deleteMany();
    await db.table.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    const mk = (email: string, name: string, role: "user" | "admin" | "super_admin") => db.user.create({ data: { email, name, role, passwordHash: "x" } });
    g1 = (await mk("g1@t.local", "Анна Гостева", "user")).id;
    g2 = (await mk("g2@t.local", "Иван Гостев", "user")).id;
    g3 = (await mk("g3@t.local", "Олег Гостев", "user")).id;
    admin = { id: (await mk("adm@t.local", "Мария Админ", "admin")).id, role: "admin" };
    boss = { id: (await mk("boss@t.local", "Борис Босс", "super_admin")).id, role: "super_admin" };
    guest = { id: g1, role: "user" };
    t = {};
    for (const [name, capacity] of [["Стол 1", 2], ["Стол 2", 4], ["Стол 3", 8]] as const) {
      t[name] = (await db.table.create({ data: { name, capacity } })).id;
    }
  });
  afterAll(() => db.$disconnect());

  async function book(userId: string, startsAt: Date, partySize = 2) {
    const r = await createBooking(db, { userId, startsAt, partySize, now: NOW, timeZone: TZ });
    if (!r.ok) throw new Error(r.reason);
    return r.booking.id;
  }
  const reseat = (actor: Actor, bookingId: string, tableId: string, now = NOW) => changeBookingTable(db, { actor, bookingId, tableId, now, timeZone: TZ });

  describe("постраничный список броней", () => {
    it("делит на страницы без пропусков и повторов, сообщает итог и число страниц", async () => {
      const ids = [];
      for (const w of Object.values(THU)) ids.push(await book(g1, w));
      const pages = [];
      for (const page of [1, 2, 3]) {
        const r = await listAdminBookings(db, admin, { page, pageSize: 2 }, TZ);
        if (!r.ok) throw new Error();
        pages.push(r.data);
      }
      expect(pages.map((p) => p.bookings.length)).toEqual([2, 2, 1]);
      expect(pages.every((p) => p.total === 5 && p.pageCount === 3 && p.pageSize === 2)).toBe(true);
      const seen = pages.flatMap((p) => p.bookings.map((b) => b.id));
      expect(new Set(seen).size).toBe(5);
      expect(new Set(seen)).toEqual(new Set(ids));
      const times = pages.flatMap((p) => p.bookings.map((b) => b.startsAt));
      expect([...times].sort().reverse()).toEqual(times); // от новых к старым
    });

    it("страница вне диапазона и мусор не ломают выдачу; пустой результат — одна страница", async () => {
      await book(g1, THU.w12);
      const far = await listAdminBookings(db, admin, { page: 99, pageSize: 2 }, TZ);
      const zero = await listAdminBookings(db, admin, { page: 0, pageSize: 2 }, TZ);
      const none = await listAdminBookings(db, admin, { status: "no_show" }, TZ);
      if (!far.ok || !zero.ok || !none.ok) throw new Error();
      expect(far.data.page).toBe(1);
      expect(zero.data.page).toBe(1);
      expect(none.data).toMatchObject({ total: 0, page: 1, pageCount: 1, bookings: [] });
    });

    it("фильтры работают вместе со страницами", async () => {
      const a = await book(g1, THU.w12);
      await book(g2, THU.w1330);
      await changeBookingStatus(db, { actor: admin, bookingId: a, to: "confirmed", now: NOW, timeZone: TZ });
      const r = await listAdminBookings(db, admin, { status: "confirmed", page: 1, pageSize: 1 }, TZ);
      if (!r.ok) throw new Error();
      expect(r.data).toMatchObject({ total: 1, pageCount: 1 });
      expect(r.data.bookings[0].id).toBe(a);
    });
  });

  describe("постраничная история", () => {
    it("делит историю на страницы и сохраняет прежний вызов listAudit", async () => {
      for (const w of Object.values(THU)) await book(g1, w);
      const p1 = await listAuditPage(db, admin, { entityType: "Booking", limit: 2, page: 1 }, TZ);
      const p3 = await listAuditPage(db, admin, { entityType: "Booking", limit: 2, page: 3 }, TZ);
      if (!p1.ok || !p3.ok) throw new Error();
      expect(p1.data).toMatchObject({ total: 5, pageCount: 3, page: 1 });
      expect(p1.data.entries).toHaveLength(2);
      expect(p3.data.entries).toHaveLength(1);
      const all = await listAudit(db, admin, { entityType: "Booking" }, TZ);
      expect(all.ok && all.data.length).toBe(5);
      expect(await listAuditPage(db, guest, {}, TZ)).toEqual({ ok: false, reason: "forbidden" });
    });
  });

  describe("варианты пересадки", () => {
    it("предлагает только активные свободные столы подходящей вместимости", async () => {
      const id = await book(g1, THU.w12); // Стол 1 (на 2)
      await book(g2, THU.w12); // занимает Стол 2 (на 4)
      const r = await listAdminBookings(db, admin, {}, TZ);
      if (!r.ok) throw new Error();
      const row = r.data.bookings.find((b) => b.id === id)!;
      expect(row.table.name).toBe("Стол 1");
      expect(row.tableOptions.map((o) => o.name)).toEqual(["Стол 3"]); // Стол 2 занят в это время
    });

    it("не предлагает столы для прошедших и неактивных броней, а для гостя пересадка закрыта", async () => {
      const id = await book(g1, THU.w12);
      await changeBookingStatus(db, { actor: admin, bookingId: id, to: "cancelled", now: NOW, timeZone: TZ });
      const r = await listAdminBookings(db, admin, {}, TZ);
      if (!r.ok) throw new Error();
      expect(r.data.bookings[0].tableOptions).toEqual([]);
      expect(await reseat(guest, id, t["Стол 3"])).toEqual({ ok: false, reason: "forbidden" });
    });
  });

  describe("пересадка", () => {
    it("меняет стол, пишет аудит с названиями столов и уведомляет гостя", async () => {
      const id = await book(g1, THU.w12);
      expect(await reseat(admin, id, t["Стол 3"])).toEqual({ ok: true, tableName: "Стол 3" });
      const row = await db.booking.findUniqueOrThrow({ where: { id }, include: { table: true } });
      expect(row.table.name).toBe("Стол 3");
      const audit = await db.auditLog.findFirstOrThrow({ where: { action: "booking_table_changed", entityId: id } });
      expect([audit.actorId, audit.before, audit.after]).toEqual([
        admin.id,
        { tableId: t["Стол 1"], tableName: "Стол 1" },
        { tableId: t["Стол 3"], tableName: "Стол 3" },
      ]);
      const note = await db.notification.findFirstOrThrow({ where: { userId: g1, type: "booking_table_changed" } });
      expect(note.body).toContain("Стол 3");
      expect(note.body).toContain("Стол 1");
      const history = await listAudit(db, admin, { entityId: id }, TZ);
      if (!history.ok) throw new Error();
      expect(history.data[0]).toMatchObject({ label: "Изменён стол брони", actor: { name: "Мария Админ" } });
      expect(history.data[0].detail).toContain("Стол 1 → Стол 3");
    });

    it("освобождает прежний стол: на него можно посадить других", async () => {
      const id = await book(g1, THU.w12);
      await reseat(boss, id, t["Стол 3"]);
      const next = await book(g2, THU.w12);
      const row = await db.booking.findUniqueOrThrow({ where: { id: next }, include: { table: true } });
      expect(row.table.name).toBe("Стол 1");
    });

    it("отказывает: мал стол, занят, тот же, неактивный, нет такого; ничего не пишет", async () => {
      const id = await book(g1, THU.w12, 3); // Стол 2 (на 4)
      await book(g2, THU.w12, 8); // занимает Стол 3
      await db.table.create({ data: { name: "Стол 4", capacity: 8, isActive: false } });
      const off = (await db.table.findUniqueOrThrow({ where: { name: "Стол 4" } })).id;
      const before = { audit: await db.auditLog.count(), notes: await db.notification.count() };
      expect(await reseat(admin, id, t["Стол 1"])).toEqual({ ok: false, reason: "too_small" });
      expect(await reseat(admin, id, t["Стол 3"])).toEqual({ ok: false, reason: "table_busy" });
      expect(await reseat(admin, id, t["Стол 2"])).toEqual({ ok: false, reason: "no_change" });
      expect(await reseat(admin, id, off)).toEqual({ ok: false, reason: "table_inactive" });
      expect(await reseat(admin, id, "nope")).toEqual({ ok: false, reason: "table_not_found" });
      expect(await reseat(admin, "missing", t["Стол 3"])).toEqual({ ok: false, reason: "not_found" });
      expect({ audit: await db.auditLog.count(), notes: await db.notification.count() }).toEqual(before);
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).tableId).toBe(t["Стол 2"]);
    });

    it("не пересаживает отменённые и прошедшие брони", async () => {
      const cancelled = await book(g1, THU.w12);
      await changeBookingStatus(db, { actor: admin, bookingId: cancelled, to: "cancelled", now: NOW, timeZone: TZ });
      expect(await reseat(admin, cancelled, t["Стол 3"])).toEqual({ ok: false, reason: "not_active" });
      const live = await book(g2, THU.w1330);
      expect(await reseat(admin, live, t["Стол 3"], at("2026-10-08T12:00:00Z"))).toEqual({ ok: false, reason: "past" });
    });

    it("два одновременных запроса на один стол: успех у одного, второй получает table_busy", async () => {
      const a = await book(g1, THU.w12);
      const b = await book(g2, THU.w12);
      const results = await Promise.all([reseat(admin, a, t["Стол 3"]), reseat(boss, b, t["Стол 3"])]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "table_busy" });
      expect(await db.booking.count({ where: { tableId: t["Стол 3"] } })).toBe(1);
    });
  });

  describe("план зала", () => {
    it("показывает столы по строкам и окна по столбцам с гостем, числом гостей и статусом", async () => {
      const id = await book(g1, THU.w12, 3);
      await book(g2, THU.w1330);
      await setSlotClosed(db, { actor: admin, startsAt: THU.w18, closed: true, reason: "Банкет", now: NOW, timeZone: TZ });
      const r = await getFloorPlan(db, admin, "2026-10-08", NOW, TZ);
      if (!r.ok) throw new Error();
      const plan = r.data;
      expect(plan.isOpenDay).toBe(true);
      expect(plan.columns.map((c) => c.time)).toEqual(["12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"]);
      expect(plan.columns[4]).toMatchObject({ closed: true, reason: "Банкет" });
      expect(plan.rows.map((x) => x.table.name)).toEqual(["Стол 1", "Стол 2", "Стол 3"]);
      const cell = plan.rows[1].cells[0]; // Стол 2 (на 4), 12:00
      expect(cell).toMatchObject({ id, guestName: "Анна Гостева", partySize: 3, status: "pending" });
      expect(plan.rows[0].cells[1]).toMatchObject({ guestName: "Иван Гостев" }); // Стол 1, 13:30
      expect(plan.rows[2].cells.every((c) => c === null)).toBe(true);
      expect(plan.totals).toMatchObject({ bookings: 2, guests: 5 });
      expect(plan.totals.freeCells).toBe(3 * 7 - 2 - 3); // всего ячеек минус занятые минус закрытое окно (3 стола)
      expect([plan.prev, plan.next]).toEqual(["2026-10-07", "2026-10-09"]);
    });

    it("не показывает отменённые брони, показывает завершённые и «не пришёл»", async () => {
      const a = await book(g1, THU.w12);
      const b = await book(g2, THU.w1330);
      const c = await book(g3, THU.w15);
      await changeBookingStatus(db, { actor: admin, bookingId: a, to: "cancelled", now: NOW, timeZone: TZ });
      for (const x of [b, c]) await changeBookingStatus(db, { actor: admin, bookingId: x, to: "confirmed", now: NOW, timeZone: TZ });
      const later = at("2026-10-08T22:00:00Z");
      await changeBookingStatus(db, { actor: admin, bookingId: b, to: "completed", now: later, timeZone: TZ });
      await changeBookingStatus(db, { actor: admin, bookingId: c, to: "no_show", now: later, timeZone: TZ });
      const r = await getFloorPlan(db, admin, "2026-10-08", later, TZ);
      if (!r.ok) throw new Error();
      const statuses = r.data.rows.flatMap((x) => x.cells).filter(Boolean).map((x) => x!.status).sort();
      expect(statuses).toEqual(["completed", "no_show"]);
    });

    it("выходной, неверная дата и закрытый для гостя доступ", async () => {
      const monday = await getFloorPlan(db, admin, "2026-10-12", NOW, TZ);
      if (!monday.ok) throw new Error();
      expect(monday.data.isOpenDay).toBe(false);
      expect(monday.data.columns).toEqual([]);
      const bad = await getFloorPlan(db, admin, "2026-02-30", NOW, TZ);
      if (!bad.ok) throw new Error();
      expect(bad.data.date).toBe("2026-10-07"); // вместо неверной даты — сегодня
      expect(await getFloorPlan(db, guest, "2026-10-08", NOW, TZ)).toEqual({ ok: false, reason: "forbidden" });
    });
  });
});

describe("описание смены стола", () => {
  it("называет оба стола", () => {
    const r = describeAudit(
      { action: "booking_table_changed", before: { tableName: "Стол 1" }, after: { tableName: "Стол 3" } },
      { actorId: "a" },
    );
    expect(r.label).toBe("Изменён стол брони");
    expect(r.detail).toContain("Стол 1 → Стол 3");
  });
});
