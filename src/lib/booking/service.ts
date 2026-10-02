import type { BookingStatus, PrismaClient, Role } from "@/generated/prisma/client";
import { formatDateRu, localDateKey, localTime } from "./format";
import {
  ACTIVE_STATUSES,
  availableWindows,
  BOOKING_HORIZON_DAYS,
  candidateWindows,
  canOwnerCancel,
  checkTransition,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  OWNER_CANCEL_DEADLINE_HOURS,
  pickTable,
  userHasConflict,
  type ActiveBookingLite,
} from "./rules";

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATE_ATTEMPTS = 4;

// Нарушение ограничения БД (Prisma 7 + драйвер pg): код P2039, причина лежит в driverAdapterError.
export function dbViolation(error: unknown): { code?: string; message: string } | null {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } })
    ?.meta?.driverAdapterError?.cause;
  if (!cause) return null;
  return { code: cause.originalCode, message: cause.originalMessage ?? "" };
}

export function isRetryableTransactionError(error: unknown): boolean {
  if ((error as { code?: string })?.code === "P2034") return true;
  const code = dbViolation(error)?.code;
  return code === "40P01" || code === "40001";
}

async function loadContext(db: PrismaClient, now: Date) {
  const horizonEnd = new Date(now.getTime() + (BOOKING_HORIZON_DAYS + 1) * DAY_MS);
  const [tables, bookings, closed] = await Promise.all([
    db.table.findMany({ select: { id: true, name: true, capacity: true, isActive: true } }),
    db.booking.findMany({
      where: { status: { in: ACTIVE_STATUSES }, endsAt: { gt: now }, startsAt: { lt: horizonEnd } },
      select: { tableId: true, userId: true, startsAt: true, endsAt: true },
    }),
    db.slot.findMany({ where: { isClosed: true, startsAt: { gt: now, lt: horizonEnd } }, select: { startsAt: true } }),
  ]);
  return { tables, bookings: bookings as ActiveBookingLite[], closedStarts: closed.map((s) => s.startsAt) };
}

export interface AvailableWindowDto {
  startsAt: string;
  date: string; // ключ дня в поясе ресторана, YYYY-MM-DD
  dateLabel: string;
  time: string; // HH:mm
}

// Доступные окна: правила проекта + занятость + закрытия админа; для залогиненного пользователя
// скрываются окна, где у него уже есть активная бронь.
export async function getAvailableWindows(
  db: PrismaClient,
  input: { partySize: number; userId?: string; now: Date; timeZone: string },
): Promise<AvailableWindowDto[]> {
  const { partySize, userId, now, timeZone } = input;
  const ctx = await loadContext(db, now);
  const own = userId ? ctx.bookings.filter((b) => b.userId === userId) : [];
  return availableWindows({
    now,
    timeZone,
    partySize,
    tables: ctx.tables,
    activeBookings: ctx.bookings,
    closedStarts: ctx.closedStarts,
  })
    .filter((w) => !userHasConflict(own, w))
    .map((w) => ({
      startsAt: w.startsAt.toISOString(),
      date: localDateKey(w.startsAt, timeZone),
      dateLabel: formatDateRu(w.startsAt, timeZone),
      time: localTime(w.startsAt, timeZone),
    }));
}

export interface BookingDto {
  id: string;
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  time: string;
  partySize: number;
  status: BookingStatus;
  comment: string | null;
  tableName: string;
  canCancel: boolean;
  cancelDeadline: string;
  createdAt: string;
}

type BookingRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  status: BookingStatus;
  comment: string | null;
  createdAt: Date;
  table: { name: string };
};

const BOOKING_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  partySize: true,
  status: true,
  comment: true,
  createdAt: true,
  table: { select: { name: true } },
} as const;

export function toBookingDto(row: BookingRow, now: Date, timeZone: string): BookingDto {
  const active = ACTIVE_STATUSES.includes(row.status);
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    dateLabel: formatDateRu(row.startsAt, timeZone),
    time: localTime(row.startsAt, timeZone),
    partySize: row.partySize,
    status: row.status,
    comment: row.comment,
    tableName: row.table.name,
    canCancel: active && canOwnerCancel(row.startsAt, now),
    cancelDeadline: new Date(row.startsAt.getTime() - OWNER_CANCEL_DEADLINE_HOURS * 60 * 60 * 1000).toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export type CreateBookingResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; reason: "invalid_party_size" | "window_unavailable" | "user_conflict" | "no_table" | "busy" };

export async function createBooking(
  db: PrismaClient,
  input: { userId: string; startsAt: Date; partySize: number; comment?: string; now: Date; timeZone: string },
): Promise<CreateBookingResult> {
  const { userId, startsAt, partySize, comment, now, timeZone } = input;
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE || partySize > MAX_PARTY_SIZE) {
    return { ok: false, reason: "invalid_party_size" };
  }

  // Окно обязано быть одним из окон по правилам: прошлое время, чужая сетка и вне горизонта отсекаются здесь.
  const window = candidateWindows(now, timeZone).find((w) => w.startsAt.getTime() === startsAt.getTime());
  if (!window) return { ok: false, reason: "window_unavailable" };

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const ctx = await loadContext(db, now);
    if (ctx.closedStarts.some((d) => d.getTime() === window.startsAt.getTime())) {
      return { ok: false, reason: "window_unavailable" };
    }
    if (userHasConflict(ctx.bookings.filter((b) => b.userId === userId), window)) {
      return { ok: false, reason: "user_conflict" };
    }
    const table = pickTable(ctx.tables, ctx.bookings, window, partySize);
    if (!table) return { ok: false, reason: "no_table" };

    try {
      const row = await db.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: { userId, tableId: table.id, startsAt: window.startsAt, endsAt: window.endsAt, partySize, comment, status: "pending" },
          select: BOOKING_SELECT,
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "booking_created",
            entityType: "Booking",
            entityId: created.id,
            after: { status: "pending", tableId: table.id, startsAt: window.startsAt.toISOString(), partySize },
          },
        });
        await tx.notification.create({
          data: {
            userId,
            bookingId: created.id,
            type: "booking_created",
            title: "Заявка принята",
            body: `${formatDateRu(window.startsAt, timeZone)}, ${localTime(window.startsAt, timeZone)}, гостей: ${partySize}, ${table.name}. Администратор подтвердит бронь.`,
          },
        });
        return created;
      });
      return { ok: true, booking: toBookingDto(row, now, timeZone) };
    } catch (error) {
      // Гонку двух одновременных запросов закрывает БД; здесь превращаем отказ в понятный результат.
      // Конкурирующие вставки под EXCLUDE-ограничением Postgres может прервать как взаимную блокировку
      // (Prisma P2034, SQLSTATE 40P01/40001): транзакция откатилась целиком, повторяем с новым состоянием.
      if (isRetryableTransactionError(error)) continue;
      const violation = dbViolation(error);
      if (violation?.message.includes("booking_user_no_overlap")) return { ok: false, reason: "user_conflict" };
      if (violation?.message.includes("booking_table_no_overlap")) continue; // стол занял другой запрос: подберём другой
      throw error;
    }
  }
  return { ok: false, reason: "busy" };
}

export async function listUserBookings(db: PrismaClient, userId: string, now: Date, timeZone: string): Promise<BookingDto[]> {
  const rows = await db.booking.findMany({
    where: { userId },
    select: BOOKING_SELECT,
    orderBy: { startsAt: "desc" },
  });
  return rows.map((r) => toBookingDto(r, now, timeZone));
}

export type CancelResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; reason: "not_found" | "invalid_transition" | "deadline_passed" | "stale" };

// Самостоятельная отмена: всегда по правилам владельца (дедлайн 3 часа), независимо от роли.
// Отмена брони сотрудником — отдельная операция администратора.
export async function cancelOwnBooking(
  db: PrismaClient,
  input: { userId: string; bookingId: string; now: Date; timeZone: string },
): Promise<CancelResult> {
  const { userId, bookingId, now, timeZone } = input;
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id: bookingId, userId }, select: BOOKING_SELECT });
    if (!booking) return { ok: false, reason: "not_found" } as const;

    const asOwner: Role = "user";
    const check = checkTransition({
      from: booking.status,
      to: "cancelled",
      actorRole: asOwner,
      actorIsOwner: true,
      startsAt: booking.startsAt,
      now,
    });
    if (!check.ok) {
      return { ok: false, reason: check.reason === "forbidden" ? "invalid_transition" : check.reason } as const;
    }

    const updated = await tx.booking.updateMany({
      where: { id: bookingId, userId, status: booking.status },
      data: { status: "cancelled" },
    });
    if (updated.count !== 1) return { ok: false, reason: "stale" } as const;

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "booking_status_changed",
        entityType: "Booking",
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: "cancelled" },
      },
    });
    await tx.notification.create({
      data: {
        userId,
        bookingId,
        type: "booking_cancelled",
        title: "Бронь отменена",
        body: `Вы отменили бронь на ${formatDateRu(booking.startsAt, timeZone)}, ${localTime(booking.startsAt, timeZone)}.`,
      },
    });
    return { ok: true, booking: toBookingDto({ ...booking, status: "cancelled" }, now, timeZone) } as const;
  });
}

// ---- Уведомления ----
export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(db: PrismaClient, userId: string): Promise<NotificationDto[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export function countUnread(db: PrismaClient, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

// Отметить прочитанным: одно уведомление (только своё) или все свои.
export async function markNotificationsRead(db: PrismaClient, userId: string, id?: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
