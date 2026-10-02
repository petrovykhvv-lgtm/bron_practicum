// Интеграционные тесты административного контура на тестовой БД (TEST_DATABASE_URL).
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createPrismaClient } from "@/lib/db";
import { changeUserRole, registerUser } from "@/lib/auth/service";
import { cancelOwnBooking, createBooking, getAvailableWindows } from "@/lib/booking/service";
import {
  changeBookingStatus,
  getAdminOverview,
  getSlotSchedule,
  listAdminBookings,
  listAudit,
  parseDateKey,
  setSlotClosed,
  type Actor,
} from "@/lib/admin/service";
import { describeAudit } from "@/lib/admin/audit-describe";
import { auditQuerySchema, bookingFilterSchema, slotChangeSchema, statusChangeSchema } from "@/lib/admin/schemas";
import { AUDIT_ENTITY_TYPES, CAPABILITIES, can } from "@/lib/permissions";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const TZ = "Europe/Moscow";
const NOW = new Date("2026-10-07T07:00:00Z"); // среда, 10:00 по Москве
const at = (iso: string) => new Date(iso);
const THU_12 = at("2026-10-08T09:00:00Z"); // чт 12:00 МСК
const THU_21 = at("2026-10-08T18:00:00Z"); // чт 21:00 МСК
const FRI_12 = at("2026-10-09T09:00:00Z"); // пт 12:00 МСК
const AFTER = at("2026-10-08T22:00:00Z"); // все брони четверга уже начались

run("административный контур", () => {
  const db = createPrismaClient(url);
  let guest1 = "", guest2 = "";
  let admin: Actor, boss: Actor, guestActor: Actor;

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
    const mk = (email: string, name: string, role: "user" | "admin" | "super_admin") =>
      db.user.create({ data: { email, name, role, passwordHash: "x" } });
    guest1 = (await mk("g1@t.local", "Анна Гостева", "user")).id;
    guest2 = (await mk("g2@t.local", "Иван Гостев", "user")).id;
    admin = { id: (await mk("adm@t.local", "Мария Админ", "admin")).id, role: "admin" };
    boss = { id: (await mk("boss@t.local", "Борис Босс", "super_admin")).id, role: "super_admin" };
    guestActor = { id: guest1, role: "user" };
    for (const [i, capacity] of [2, 4, 8].entries()) await db.table.create({ data: { name: `Стол ${i + 1}`, capacity } });
  });
  afterAll(() => db.$disconnect());

  async function book(userId: string, startsAt: Date, partySize = 2) {
    const r = await createBooking(db, { userId, startsAt, partySize, now: NOW, timeZone: TZ });
    if (!r.ok) throw new Error(r.reason);
    return r.booking.id;
  }
  const setStatus = (actor: Actor, bookingId: string, to: Parameters<typeof changeBookingStatus>[1]["to"], now = NOW) =>
    changeBookingStatus(db, { actor, bookingId, to, now, timeZone: TZ });

  describe("список броней", () => {
    it("недоступен гостю", async () => {
      expect(await listAdminBookings(db, guestActor, {}, TZ)).toEqual({ ok: false, reason: "forbidden" });
    });

    it("показывает гостя, назначенный стол, статус и доступные переходы", async () => {
      const id = await book(guest1, THU_12, 3);
      const r = await listAdminBookings(db, admin, {}, TZ);
      if (!r.ok) throw new Error();
      expect(r.data.bookings).toHaveLength(1);
      expect(r.data.bookings[0]).toMatchObject({
        id,
        status: "pending",
        partySize: 3,
        table: { name: "Стол 2", capacity: 4 },
        guest: { name: "Анна Гостева", email: "g1@t.local" },
        nextStatuses: ["confirmed", "cancelled"],
      });
      expect(JSON.stringify(r)).not.toContain("passwordHash");
    });

    it("фильтрует по статусу", async () => {
      const a = await book(guest1, THU_12);
      await book(guest2, THU_21);
      await setStatus(admin, a, "confirmed");
      const confirmed = await listAdminBookings(db, admin, { status: "confirmed" }, TZ);
      const pending = await listAdminBookings(db, admin, { status: "pending" }, TZ);
      if (!confirmed.ok || !pending.ok) throw new Error();
      expect(confirmed.data.bookings.map((b) => b.id)).toEqual([a]);
      expect(pending.data.bookings).toHaveLength(1);
      expect(pending.data.bookings[0].status).toBe("pending");
    });

    it("фильтрует по датам по границам дня в поясе ресторана", async () => {
      await book(guest1, THU_12);
      await book(guest2, THU_21); // 21:00 МСК, 18:00 UTC — тот же день
      await book(guest1, FRI_12);
      const day = await listAdminBookings(db, admin, { from: "2026-10-08", to: "2026-10-08" }, TZ);
      const from = await listAdminBookings(db, admin, { from: "2026-10-09" }, TZ);
      const to = await listAdminBookings(db, admin, { to: "2026-10-08" }, TZ);
      const none = await listAdminBookings(db, admin, { from: "2026-10-20", to: "2026-10-21" }, TZ);
      if (!day.ok || !from.ok || !to.ok || !none.ok) throw new Error();
      expect(day.data.bookings).toHaveLength(2);
      expect(from.data.bookings).toHaveLength(1);
      expect(to.data.bookings).toHaveLength(2);
      expect(none.data.bookings).toHaveLength(0);
    });

    it("для терминальных статусов переходов нет", async () => {
      const id = await book(guest1, THU_12);
      await setStatus(admin, id, "confirmed");
      await setStatus(admin, id, "no_show", AFTER);
      const r = await listAdminBookings(db, admin, {}, TZ);
      if (!r.ok) throw new Error();
      expect(r.data.bookings[0]).toMatchObject({ status: "no_show", nextStatuses: [] });
    });

    it("parseDateKey принимает только настоящие даты", () => {
      expect(parseDateKey("2026-10-08")).toEqual({ year: 2026, month: 10, day: 8 });
      for (const bad of ["2026-02-30", "2026-13-01", "08.10.2026", "", "2026-1-1"]) expect(parseDateKey(bad)).toBeNull();
    });
  });

  describe("смена статуса", () => {
    it("подтверждение пишет аудит с автором и уведомляет гостя", async () => {
      const id = await book(guest1, THU_12);
      expect(await setStatus(admin, id, "confirmed")).toEqual({ ok: true, status: "confirmed" });
      const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: "booking_status_changed" } });
      expect([audit.actorId, audit.before, audit.after]).toEqual([admin.id, { status: "pending" }, { status: "confirmed" }]);
      const note = await db.notification.findFirstOrThrow({ where: { userId: guest1, type: "booking_confirmed" } });
      expect(note.bookingId).toBe(id);
    });

    it("проходит цепочку pending → confirmed → completed, а super_admin тоже может", async () => {
      const id = await book(guest1, THU_12);
      expect((await setStatus(admin, id, "confirmed")).ok).toBe(true);
      expect((await setStatus(boss, id, "completed", AFTER)).ok).toBe(true);
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("completed");
      expect(await db.notification.count({ where: { userId: guest1, type: "booking_completed" } })).toBe(1);
    });

    it("отмечает no_show и уведомляет гостя", async () => {
      const id = await book(guest1, THU_12);
      await setStatus(admin, id, "confirmed");
      expect((await setStatus(admin, id, "no_show", AFTER)).ok).toBe(true);
      expect(await db.notification.count({ where: { userId: guest1, type: "booking_no_show" } })).toBe(1);
    });

    it("сотрудник отменяет и после дедлайна гостя; стол освобождается", async () => {
      const id = await book(guest1, THU_12, 8);
      const lateNow = at("2026-10-08T08:00:00Z"); // за час до начала
      expect(await cancelOwnBooking(db, { userId: guest1, bookingId: id, now: lateNow, timeZone: TZ })).toEqual({ ok: false, reason: "deadline_passed" });
      expect((await setStatus(admin, id, "cancelled", lateNow)).ok).toBe(true);
      await expect(book(guest2, THU_12, 8)).resolves.toBeTruthy();
      expect(await db.notification.count({ where: { userId: guest1, type: "booking_cancelled" } })).toBe(1);
    });

    it("терминальные статусы не возвращаются в активные, ничего не пишется", async () => {
      const id = await book(guest1, THU_12);
      await setStatus(admin, id, "cancelled");
      const before = { audit: await db.auditLog.count(), notes: await db.notification.count() };
      for (const to of ["pending", "confirmed", "completed", "no_show", "cancelled"] as const) {
        for (const actor of [admin, boss]) {
          expect(await setStatus(actor, id, to)).toEqual({ ok: false, reason: "invalid_transition" });
        }
      }
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
      expect({ audit: await db.auditLog.count(), notes: await db.notification.count() }).toEqual(before);
    });

    it("до начала брони нельзя завершить и отметить «не пришёл»: ничего не пишется; после начала можно", async () => {
    const id = await book(guest1, THU_12);
    await setStatus(admin, id, "confirmed");
    const before = { audit: await db.auditLog.count(), notes: await db.notification.count() };
    for (const to of ["completed", "no_show"] as const) {
      expect(await setStatus(admin, id, to)).toEqual({ ok: false, reason: "too_early" });
      expect(await setStatus(boss, id, to)).toEqual({ ok: false, reason: "too_early" });
    }
    expect({ audit: await db.auditLog.count(), notes: await db.notification.count() }).toEqual(before);
    const listed = await listAdminBookings(db, admin, {}, TZ);
    if (!listed.ok) throw new Error();
    expect(listed.data.bookings[0]).toMatchObject({ startsInFuture: true, nextStatuses: ["cancelled"] });
    expect((await setStatus(admin, id, "completed", AFTER)).ok).toBe(true);
  });

  it("запрещает недопустимые переходы из активных статусов", async () => {
      const id = await book(guest1, THU_12);
      expect(await setStatus(admin, id, "completed")).toEqual({ ok: false, reason: "invalid_transition" });
      expect(await setStatus(admin, id, "no_show")).toEqual({ ok: false, reason: "invalid_transition" });
      expect(await setStatus(admin, id, "pending")).toEqual({ ok: false, reason: "invalid_transition" });
      await setStatus(admin, id, "confirmed");
      expect(await setStatus(admin, id, "pending")).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it("гость не меняет статус даже своей брони через админский сервис", async () => {
      const id = await book(guest1, THU_12);
      expect(await setStatus(guestActor, id, "confirmed")).toEqual({ ok: false, reason: "forbidden" });
      expect(await setStatus(guestActor, id, "cancelled")).toEqual({ ok: false, reason: "forbidden" });
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("pending");
    });

    it("неизвестная бронь", async () => {
      expect(await setStatus(admin, "missing", "confirmed")).toEqual({ ok: false, reason: "not_found" });
    });

    it("два одновременных подтверждения: успешно ровно одно", async () => {
      const id = await book(guest1, THU_12);
      const results = await Promise.all([setStatus(admin, id, "confirmed"), setStatus(boss, id, "confirmed")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.auditLog.count({ where: { entityId: id, action: "booking_status_changed" } })).toBe(1);
      expect(await db.notification.count({ where: { type: "booking_confirmed" } })).toBe(1);
    });
  });

  describe("окна записи", () => {
    it("расписание показывает загрузку зала и закрытия", async () => {
      await book(guest1, THU_12);
      await book(guest2, THU_12);
      await setSlotClosed(db, { actor: admin, startsAt: THU_21, closed: true, reason: "Банкет", now: NOW, timeZone: TZ });
      const r = await getSlotSchedule(db, admin, NOW, TZ);
      if (!r.ok) throw new Error();
      const busy = r.data.find((s) => s.startsAt === THU_12.toISOString());
      const closed = r.data.find((s) => s.startsAt === THU_21.toISOString());
      expect(busy).toMatchObject({ activeBookings: 2, freeTables: 1, closed: false });
      expect(closed).toMatchObject({ closed: true, reason: "Банкет", activeBookings: 0, freeTables: 3 });
      expect(r.data.every((s) => new Date(s.startsAt) > NOW)).toBe(true);
    });

    it("закрытие окна убирает его из выдачи гостю и блокирует создание брони", async () => {
      const r = await setSlotClosed(db, { actor: admin, startsAt: THU_12, closed: true, now: NOW, timeZone: TZ });
      expect(r).toEqual({ ok: true, closed: true, activeBookings: 0 });
      const windows = await getAvailableWindows(db, { partySize: 2, now: NOW, timeZone: TZ });
      expect(windows.some((w) => w.startsAt === THU_12.toISOString())).toBe(false);
      expect(await createBooking(db, { userId: guest1, startsAt: THU_12, partySize: 2, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "window_unavailable" });
    });

    it("повторное открытие возвращает окно, аудит фиксирует закрытие и открытие", async () => {
      await setSlotClosed(db, { actor: admin, startsAt: THU_12, closed: true, reason: "Санитарный день", now: NOW, timeZone: TZ });
      await setSlotClosed(db, { actor: boss, startsAt: THU_12, closed: false, now: NOW, timeZone: TZ });
      const windows = await getAvailableWindows(db, { partySize: 2, now: NOW, timeZone: TZ });
      expect(windows.some((w) => w.startsAt === THU_12.toISOString())).toBe(true);
      const log = await db.auditLog.findMany({ where: { entityType: "Slot" }, orderBy: { createdAt: "asc" } });
      expect(log.map((l) => [l.action, l.actorId])).toEqual([["slot_closed", admin.id], ["slot_reopened", boss.id]]);
    });

    it("закрытие окна с бронями не отменяет их и предупреждает о числе броней", async () => {
      const id = await book(guest1, THU_12);
      const r = await setSlotClosed(db, { actor: admin, startsAt: THU_12, closed: true, now: NOW, timeZone: TZ });
      expect(r).toEqual({ ok: true, closed: true, activeBookings: 1 });
      expect((await db.booking.findUniqueOrThrow({ where: { id } })).status).toBe("pending");
    });

    it("отклоняет окна вне правил, повторное состояние и гостя", async () => {
      const bad = [at("2026-10-07T04:00:00Z"), at("2026-10-08T09:30:00Z"), at("2026-10-12T09:00:00Z"), at("2026-10-25T09:00:00Z")];
      for (const startsAt of bad) {
        expect(await setSlotClosed(db, { actor: admin, startsAt, closed: true, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "invalid_window" });
      }
      await setSlotClosed(db, { actor: admin, startsAt: THU_12, closed: true, reason: "x", now: NOW, timeZone: TZ });
      expect(await setSlotClosed(db, { actor: admin, startsAt: THU_12, closed: true, reason: "x", now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "no_change" });
      expect(await setSlotClosed(db, { actor: guestActor, startsAt: THU_21, closed: true, now: NOW, timeZone: TZ })).toEqual({ ok: false, reason: "forbidden" });
      expect(await getSlotSchedule(db, guestActor, NOW, TZ)).toEqual({ ok: false, reason: "forbidden" });
      expect(await db.slot.count()).toBe(1);
    });
  });

  describe("история изменений", () => {
    it("показывает, кто и когда создал, подтвердил, отменил, завершил и отметил no_show", async () => {
      const a = await book(guest1, THU_12);
      const b = await book(guest2, THU_21);
      await setStatus(admin, a, "confirmed");
      await setStatus(boss, a, "completed", AFTER);
      await setStatus(admin, b, "confirmed");
      await setStatus(boss, b, "no_show", AFTER);
      const c = await book(guest1, FRI_12);
      await cancelOwnBooking(db, { userId: guest1, bookingId: c, now: NOW, timeZone: TZ });

      const r = await listAudit(db, admin, { entityType: "Booking" }, TZ);
      if (!r.ok) throw new Error();
      const summary = r.data.map((e) => [e.label, e.actor?.name]);
      expect(summary).toEqual(expect.arrayContaining([
        ["Создана бронь", "Анна Гостева"],
        ["Создана бронь", "Иван Гостев"],
        ["Бронь подтверждена", "Мария Админ"],
        ["Бронь завершена", "Борис Босс"],
        ["Гость не пришёл", "Борис Босс"],
        ["Бронь отменена гостем", "Анна Гостева"],
      ]));
      const done = r.data.find((e) => e.label === "Бронь завершена");
      expect(done?.detail).toContain("Анна Гостева");
      expect(done?.detail).toContain("Стол 1");
      expect(done?.detail).toContain("Подтверждена → Завершена");
      expect(done?.createdLabel).toMatch(/\d{2}:\d{2}/);
      expect(Date.parse(done!.createdAt)).not.toBeNaN();
      expect(JSON.stringify(r)).not.toContain("passwordHash");
    });

    it("отличает отмену рестораном от отмены гостем", async () => {
      const a = await book(guest1, THU_12);
      await setStatus(admin, a, "cancelled");
      const r = await listAudit(db, admin, { entityId: a }, TZ);
      if (!r.ok) throw new Error();
      expect(r.data.map((e) => e.label)).toEqual(["Бронь отменена рестораном", "Создана бронь"]);
    });

    it("история одной брони фильтруется по entityId и идёт от новых к старым", async () => {
      const a = await book(guest1, THU_12);
      await book(guest2, THU_21);
      await setStatus(admin, a, "confirmed");
      const r = await listAudit(db, admin, { entityId: a }, TZ);
      if (!r.ok) throw new Error();
      expect(r.data).toHaveLength(2);
      expect(r.data.every((e) => e.entityId === a)).toBe(true);
      expect(r.data[0].createdAt >= r.data[1].createdAt).toBe(true);
    });

    it("admin видит брони и окна, но не смену ролей и регистрации; super_admin видит всё", async () => {
      await registerUser(db, { email: "new@t.local", name: "Новый", password: "Test-Password-1" });
      const target = await db.user.findUniqueOrThrow({ where: { email: "new@t.local" } });
      await changeUserRole(db, { actor: boss, targetId: target.id, newRole: "admin" });
      await book(guest1, THU_12);
      await setSlotClosed(db, { actor: admin, startsAt: THU_21, closed: true, now: NOW, timeZone: TZ });

      const asAdmin = await listAudit(db, admin, {}, TZ);
      const asBoss = await listAudit(db, boss, {}, TZ);
      if (!asAdmin.ok || !asBoss.ok) throw new Error();
      expect(new Set(asAdmin.data.map((e) => e.entityType))).toEqual(new Set(["Booking", "Slot"]));
      expect(new Set(asBoss.data.map((e) => e.entityType))).toEqual(new Set(["Booking", "Slot", "User"]));

      const role = asBoss.data.find((e) => e.action === "user_role_changed");
      expect(role?.label).toBe("Изменена роль пользователя");
      expect(role?.detail).toBe("Новый: Гость → Администратор");
      expect(role?.actor).toMatchObject({ name: "Борис Босс", role: "super_admin" });
      expect(asBoss.data.some((e) => e.action === "user_registered" && e.detail === "Новый")).toBe(true);

      // Запрос чужого типа сущности для admin просто пуст, а не ошибка и не утечка.
      expect(await listAudit(db, admin, { entityType: "User" }, TZ)).toEqual({ ok: true, data: [] });
      expect(await listAudit(db, admin, { entityId: target.id }, TZ)).toEqual({ ok: true, data: [] });
    });

    it("записи об окнах понятны: что закрыто и почему", async () => {
      await setSlotClosed(db, { actor: admin, startsAt: THU_21, closed: true, reason: "Банкет", now: NOW, timeZone: TZ });
      const r = await listAudit(db, admin, { entityType: "Slot" }, TZ);
      if (!r.ok) throw new Error();
      expect(r.data[0].label).toBe("Окно записи закрыто");
      expect(r.data[0].detail).toContain("21:00");
      expect(r.data[0].detail).toContain("Банкет");
    });

    it("недоступна гостю", async () => {
      expect(await listAudit(db, guestActor, {}, TZ)).toEqual({ ok: false, reason: "forbidden" });
    });
  });

  describe("обзор", () => {
    it("считает заявки, требующие решения, и занятость сегодня и на неделю", async () => {
      const a = await book(guest1, THU_12);
      await book(guest2, THU_21);
      await setStatus(admin, a, "confirmed");
      const todayBook = await createBooking(db, { userId: guest1, startsAt: at("2026-10-07T13:30:00Z"), partySize: 2, now: NOW, timeZone: TZ });
      expect(todayBook.ok).toBe(true); // сегодня 16:30 МСК
      const r = await getAdminOverview(db, admin, NOW, TZ);
      if (!r.ok) throw new Error();
      expect(r.data).toMatchObject({ pendingUpcoming: 2, pendingOverdue: 0, todayActive: 1, next7Active: 3 });
      expect(r.data.queue.map((q) => q.guestName)).toEqual(["Анна Гостева", "Иван Гостев"]); // по времени начала
      expect(await getAdminOverview(db, guestActor, NOW, TZ)).toEqual({ ok: false, reason: "forbidden" });
    });
  });
});

describe("описание записей истории", () => {
  it("не падает на неизвестных данных", () => {
    expect(describeAudit({ action: "booking_created", before: null, after: null }, { actorId: null })).toEqual({
      label: "Создана бронь",
      detail: "бронь удалена или недоступна",
    });
    expect(describeAudit({ action: "something_new", before: null, after: null }, { actorId: null }).label).toBe("something_new");
  });
});

describe("схемы и права админки", () => {
  it("фильтры: пустые значения игнорируются, даты проверяются, диапазон не перевёрнут", () => {
    expect(bookingFilterSchema.parse({ status: "", from: "", to: null })).toEqual({});
    expect(bookingFilterSchema.parse({ status: "no_show", from: "2026-10-01", to: "2026-10-31" })).toMatchObject({ status: "no_show" });
    expect(bookingFilterSchema.safeParse({ status: "unknown" }).success).toBe(false);
    expect(bookingFilterSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(bookingFilterSchema.safeParse({ from: "2026-10-10", to: "2026-10-01" }).success).toBe(false);
  });

  it("смена статуса и окна принимают только известные значения", () => {
    expect(statusChangeSchema.safeParse({ status: "confirmed" }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(slotChangeSchema.safeParse({ startsAt: "2026-10-08T09:00:00.000Z", closed: true, reason: "x".repeat(201) }).success).toBe(false);
    expect(slotChangeSchema.safeParse({ startsAt: "2026-10-08T09:00:00.000Z", closed: "yes" }).success).toBe(false);
    expect(auditQuerySchema.parse({ entityType: "", entityId: null, limit: "" })).toEqual({});
    expect(auditQuerySchema.safeParse({ entityType: "Other" }).success).toBe(false);
  });

  it("список возможностей для интерфейса совпадает с матрицей: admin — всё, кроме ролей и полной истории", () => {
    for (const c of CAPABILITIES) expect(can("super_admin", c.permission)).toBe(true);
    const adminLacks = CAPABILITIES.filter((c) => !can("admin", c.permission)).map((c) => c.permission);
    expect(adminLacks).toEqual(["user:change_role", "audit:view_all"]);
    for (const c of CAPABILITIES) expect(can("user", c.permission)).toBe(false);
    expect(AUDIT_ENTITY_TYPES.user).toEqual([]);
    expect(AUDIT_ENTITY_TYPES.admin).not.toContain("User");
    expect(AUDIT_ENTITY_TYPES.super_admin).toContain("User");
  });
});
