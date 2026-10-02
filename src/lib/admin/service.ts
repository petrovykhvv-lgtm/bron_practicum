import type { AuditAction, BookingStatus, NotificationType, PrismaClient, Role } from "@/generated/prisma/client";
import { formatDateRu, formatDateTimeRu, localDateKey, localTime } from "@/lib/booking/format";
import {
  ACTIVE_STATUSES,
  allowedNextStatuses,
  BOOKING_HORIZON_DAYS,
  candidateWindows,
  checkTransition,
} from "@/lib/booking/rules";
import { addDays, zonedTimeToUtc, type LocalDate } from "@/lib/booking/tz";
import { AUDIT_ENTITY_TYPES, can, PUBLIC_USER_SELECT } from "@/lib/permissions";
import { describeAudit } from "./audit-describe";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 200;

export interface Actor {
  id: string;
  role: Role;
}

export function parseDateKey(key: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const back = addDays(date, 0);
  return back.year === date.year && back.month === date.month && back.day === date.day ? date : null;
}

// ---- Список броней ----
export interface AdminBookingFilter {
  status?: BookingStatus;
  from?: string; // YYYY-MM-DD, день по поясу ресторана, включительно
  to?: string; // YYYY-MM-DD, включительно
}

export interface AdminBookingDto {
  id: string;
  startsAt: string;
  dateLabel: string;
  time: string;
  partySize: number;
  status: BookingStatus;
  comment: string | null;
  createdAt: string;
  table: { id: string; name: string; capacity: number };
  guest: { id: string; name: string; email: string };
  nextStatuses: BookingStatus[];
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; reason: "forbidden" };

export async function listAdminBookings(
  db: PrismaClient,
  actor: Actor,
  filter: AdminBookingFilter,
  timeZone: string,
): Promise<AdminResult<{ bookings: AdminBookingDto[]; truncated: boolean }>> {
  if (!can(actor.role, "booking:view_all")) return { ok: false, reason: "forbidden" };

  const range: { gte?: Date; lt?: Date } = {};
  const from = filter.from ? parseDateKey(filter.from) : null;
  const to = filter.to ? parseDateKey(filter.to) : null;
  if (from) range.gte = zonedTimeToUtc({ ...from, hour: 0, minute: 0 }, timeZone);
  if (to) range.lt = zonedTimeToUtc({ ...addDays(to, 1), hour: 0, minute: 0 }, timeZone);

  const rows = await db.booking.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(range.gte || range.lt ? { startsAt: range } : {}),
    },
    select: {
      id: true,
      startsAt: true,
      partySize: true,
      status: true,
      comment: true,
      createdAt: true,
      table: { select: { id: true, name: true, capacity: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMIT + 1,
  });

  const now = new Date();
  const bookings = rows.slice(0, LIST_LIMIT).map((r): AdminBookingDto => ({
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    dateLabel: formatDateRu(r.startsAt, timeZone),
    time: localTime(r.startsAt, timeZone),
    partySize: r.partySize,
    status: r.status,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    table: r.table,
    guest: r.user,
    nextStatuses: allowedNextStatuses(r.status).filter(
      (to) =>
        checkTransition({ from: r.status, to, actorRole: actor.role, actorIsOwner: false, startsAt: r.startsAt, now }).ok,
    ),
  }));
  return { ok: true, data: { bookings, truncated: rows.length > LIST_LIMIT } };
}

// ---- Смена статуса ----
const NOTIFICATION_BY_STATUS: Partial<Record<BookingStatus, NotificationType>> = {
  confirmed: "booking_confirmed",
  cancelled: "booking_cancelled",
  completed: "booking_completed",
  no_show: "booking_no_show",
};

export type ChangeStatusResult =
  | { ok: true; status: BookingStatus }
  | { ok: false; reason: "forbidden" | "not_found" | "invalid_transition" | "stale" };

export async function changeBookingStatus(
  db: PrismaClient,
  input: { actor: Actor; bookingId: string; to: BookingStatus; now: Date; timeZone: string },
): Promise<ChangeStatusResult> {
  const { actor, bookingId, to, now, timeZone } = input;
  if (!can(actor.role, "booking:change_status")) return { ok: false, reason: "forbidden" };

  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, status: true, startsAt: true, partySize: true, table: { select: { name: true } } },
    });
    if (!booking) return { ok: false, reason: "not_found" } as const;

    const check = checkTransition({
      from: booking.status,
      to,
      actorRole: actor.role,
      actorIsOwner: booking.userId === actor.id,
      startsAt: booking.startsAt,
      now,
    });
    if (!check.ok) return { ok: false, reason: check.reason === "forbidden" ? "forbidden" : "invalid_transition" } as const;

    // Условие по текущему статусу: из двух одновременных решений сработает только одно.
    const updated = await tx.booking.updateMany({ where: { id: bookingId, status: booking.status }, data: { status: to } });
    if (updated.count !== 1) return { ok: false, reason: "stale" } as const;

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "booking_status_changed",
        entityType: "Booking",
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: to },
      },
    });

    const type = NOTIFICATION_BY_STATUS[to];
    if (type) {
      const when = formatDateTimeRu(booking.startsAt, timeZone);
      const texts: Record<string, [string, string]> = {
        booking_confirmed: ["Бронь подтверждена", `Ждём вас: ${when}, гостей: ${booking.partySize}, ${booking.table.name}.`],
        booking_cancelled: ["Бронь отменена рестораном", `Бронь на ${when} отменена. Если остались вопросы, свяжитесь с рестораном.`],
        booking_completed: ["Спасибо за визит", `Визит ${when} завершён. Будем рады видеть вас снова.`],
        booking_no_show: ["Бронь отмечена как «не пришёл»", `Бронь на ${when} отмечена как «гость не пришёл».`],
      };
      const [title, body] = texts[type];
      await tx.notification.create({ data: { userId: booking.userId, bookingId, type, title, body } });
    }
    return { ok: true, status: to } as const;
  });
}

// ---- Окна записи ----
export interface SlotScheduleItem {
  startsAt: string;
  date: string;
  dateLabel: string;
  time: string;
  closed: boolean;
  reason: string | null;
  activeBookings: number;
  freeTables: number;
}

// Расписание ближайших окон по правилам с отметками администратора и загрузкой зала.
export async function getSlotSchedule(
  db: PrismaClient,
  actor: Actor,
  now: Date,
  timeZone: string,
): Promise<AdminResult<SlotScheduleItem[]>> {
  if (!can(actor.role, "slot:manage")) return { ok: false, reason: "forbidden" };
  const windows = candidateWindows(now, timeZone);
  if (windows.length === 0) return { ok: true, data: [] };
  const horizonEnd = new Date(now.getTime() + (BOOKING_HORIZON_DAYS + 1) * DAY_MS);
  const [slots, bookings, activeTables] = await Promise.all([
    db.slot.findMany({ where: { startsAt: { gt: now, lt: horizonEnd } }, select: { startsAt: true, isClosed: true, reason: true } }),
    db.booking.findMany({
      where: { status: { in: ACTIVE_STATUSES }, startsAt: { gt: now, lt: horizonEnd } },
      select: { startsAt: true },
    }),
    db.table.count({ where: { isActive: true } }),
  ]);
  const slotBy = new Map(slots.map((s) => [s.startsAt.getTime(), s]));
  const countBy = new Map<number, number>();
  for (const b of bookings) countBy.set(b.startsAt.getTime(), (countBy.get(b.startsAt.getTime()) ?? 0) + 1);

  return {
    ok: true,
    data: windows.map((w) => {
      const key = w.startsAt.getTime();
      const slot = slotBy.get(key);
      const booked = countBy.get(key) ?? 0;
      return {
        startsAt: w.startsAt.toISOString(),
        date: localDateKey(w.startsAt, timeZone),
        dateLabel: formatDateRu(w.startsAt, timeZone),
        time: localTime(w.startsAt, timeZone),
        closed: slot?.isClosed ?? false,
        reason: slot?.isClosed ? (slot.reason ?? null) : null,
        activeBookings: booked,
        freeTables: Math.max(activeTables - booked, 0),
      };
    }),
  };
}

export type SetSlotResult =
  | { ok: true; closed: boolean; activeBookings: number }
  | { ok: false; reason: "forbidden" | "invalid_window" | "no_change" };

// Закрыть или снова открыть окно. Уже созданные брони в закрытом окне не отменяются: их ведёт администратор.
export async function setSlotClosed(
  db: PrismaClient,
  input: { actor: Actor; startsAt: Date; closed: boolean; reason?: string; now: Date; timeZone: string },
): Promise<SetSlotResult> {
  const { actor, startsAt, closed, now, timeZone } = input;
  if (!can(actor.role, "slot:manage")) return { ok: false, reason: "forbidden" };
  const window = candidateWindows(now, timeZone).find((w) => w.startsAt.getTime() === startsAt.getTime());
  if (!window) return { ok: false, reason: "invalid_window" };
  const reason = closed ? input.reason?.trim() || null : null;

  return db.$transaction(async (tx) => {
    const existing = await tx.slot.findUnique({ where: { startsAt: window.startsAt } });
    if ((existing?.isClosed ?? false) === closed && (!closed || (existing?.reason ?? null) === reason)) {
      return { ok: false, reason: "no_change" } as const;
    }
    const slot = await tx.slot.upsert({
      where: { startsAt: window.startsAt },
      create: { startsAt: window.startsAt, isClosed: closed, reason, updatedById: actor.id },
      update: { isClosed: closed, reason, updatedById: actor.id },
    });
    const action: AuditAction = closed ? "slot_closed" : "slot_reopened";
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        entityType: "Slot",
        entityId: slot.id,
        before: { closed: existing?.isClosed ?? false },
        after: { closed, startsAt: window.startsAt.toISOString(), whenLabel: formatDateTimeRu(window.startsAt, timeZone), reason },
      },
    });
    const activeBookings = await tx.booking.count({ where: { startsAt: window.startsAt, status: { in: ACTIVE_STATUSES } } });
    return { ok: true, closed, activeBookings } as const;
  });
}

// ---- История изменений ----
export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

export interface AuditEntryDto {
  id: string;
  createdAt: string;
  createdLabel: string;
  action: AuditAction;
  label: string;
  detail: string;
  entityType: string;
  entityId: string;
  actor: { id: string; name: string; email: string; role: Role } | null;
}

export async function listAudit(
  db: PrismaClient,
  actor: Actor,
  filter: AuditFilter,
  timeZone: string,
): Promise<AdminResult<AuditEntryDto[]>> {
  if (!can(actor.role, "audit:view_bookings")) return { ok: false, reason: "forbidden" };
  const allowed = AUDIT_ENTITY_TYPES[actor.role];
  const types = filter.entityType ? allowed.filter((t) => t === filter.entityType) : [...allowed];
  if (types.length === 0) return { ok: true, data: [] };

  const rows = await db.auditLog.findMany({
    where: { entityType: { in: types }, ...(filter.entityId ? { entityId: filter.entityId } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 100, 300),
  });

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const bookingIds = rows.filter((r) => r.entityType === "Booking").map((r) => r.entityId);
  const userIds = rows.filter((r) => r.entityType === "User").map((r) => r.entityId);
  const [actors, bookings, targets] = await Promise.all([
    db.user.findMany({ where: { id: { in: actorIds } }, select: PUBLIC_USER_SELECT }),
    db.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { id: true, userId: true, startsAt: true, partySize: true, table: { select: { name: true } }, user: { select: { name: true } } },
    }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const actorBy = new Map(actors.map((u) => [u.id, u]));
  const bookingBy = new Map(bookings.map((b) => [b.id, b]));
  const targetBy = new Map(targets.map((u) => [u.id, u.name]));

  return {
    ok: true,
    data: rows.map((r): AuditEntryDto => {
      const b = r.entityType === "Booking" ? bookingBy.get(r.entityId) : undefined;
      const { label, detail } = describeAudit(
        { action: r.action, before: r.before, after: r.after },
        {
          actorId: r.actorId,
          booking: b && {
            userId: b.userId,
            guestName: b.user.name,
            when: formatDateTimeRu(b.startsAt, timeZone),
            partySize: b.partySize,
            tableName: b.table.name,
          },
          targetUserName: r.entityType === "User" ? targetBy.get(r.entityId) : undefined,
        },
      );
      const a = r.actorId ? actorBy.get(r.actorId) : undefined;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        createdLabel: formatDateTimeRu(r.createdAt, timeZone),
        action: r.action,
        label,
        detail,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: a ? { id: a.id, name: a.name, email: a.email, role: a.role } : null,
      };
    }),
  };
}

// ---- Обзор для начала смены ----
export interface AdminOverview {
  pendingUpcoming: number;
  pendingOverdue: number;
  todayActive: number;
  next7Active: number;
  queue: { id: string; dateLabel: string; time: string; partySize: number; tableName: string; guestName: string }[];
}

export async function getAdminOverview(
  db: PrismaClient,
  actor: Actor,
  now: Date,
  timeZone: string,
): Promise<AdminResult<AdminOverview>> {
  if (!can(actor.role, "booking:view_all")) return { ok: false, reason: "forbidden" };
  const parts = localDateKey(now, timeZone).split("-").map(Number);
  const today = { year: parts[0], month: parts[1], day: parts[2] };
  const dayStart = zonedTimeToUtc({ ...today, hour: 0, minute: 0 }, timeZone);
  const tomorrow = zonedTimeToUtc({ ...addDays(today, 1), hour: 0, minute: 0 }, timeZone);
  const weekEnd = zonedTimeToUtc({ ...addDays(today, 8), hour: 0, minute: 0 }, timeZone);

  const [pendingUpcoming, pendingOverdue, todayActive, next7Active, queue] = await Promise.all([
    db.booking.count({ where: { status: "pending", startsAt: { gt: now } } }),
    db.booking.count({ where: { status: "pending", startsAt: { lte: now } } }),
    db.booking.count({ where: { status: { in: ACTIVE_STATUSES }, startsAt: { gte: dayStart, lt: tomorrow } } }),
    db.booking.count({ where: { status: { in: ACTIVE_STATUSES }, startsAt: { gte: dayStart, lt: weekEnd } } }),
    db.booking.findMany({
      where: { status: "pending", startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, startsAt: true, partySize: true, table: { select: { name: true } }, user: { select: { name: true } } },
    }),
  ]);
  return {
    ok: true,
    data: {
      pendingUpcoming,
      pendingOverdue,
      todayActive,
      next7Active,
      queue: queue.map((q) => ({
        id: q.id,
        dateLabel: formatDateRu(q.startsAt, timeZone),
        time: localTime(q.startsAt, timeZone),
        partySize: q.partySize,
        tableName: q.table.name,
        guestName: q.user.name,
      })),
    },
  };
}
