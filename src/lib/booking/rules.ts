import type { BookingStatus, Role } from "@/generated/prisma/client";
import { addDays, getZonedParts, weekdayOf, zonedTimeToUtc } from "./tz";

// ---- Константы правил (SPEC.md, раздел 6) ----
export const BOOKING_HORIZON_DAYS = 14; // сегодня и ещё 13 дней вперёд
export const OPEN_WEEKDAYS = [2, 3, 4, 5, 6, 0]; // вторник–воскресенье (понедельник выходной)
export const SLOT_STEP_MINUTES = 90;
export const FIRST_SLOT_MINUTES = 12 * 60; // 12:00
export const LAST_SLOT_MINUTES = 21 * 60; // 21:00 — последнее время начала
export const MIN_PARTY_SIZE = 1;
export const MAX_PARTY_SIZE = 8;
export const OWNER_CANCEL_DEADLINE_HOURS = 3;
export const ACTIVE_STATUSES: BookingStatus[] = ["pending", "confirmed"];

const MINUTE = 60_000;

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface TableLite {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
}

export interface ActiveBookingLite extends Interval {
  tableId: string;
  userId: string;
}

export function isActiveStatus(status: BookingStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

// Все окна, допустимые правилами календаря и времени. Занятость и столы не учитываются.
export function candidateWindows(now: Date, timeZone: string): Interval[] {
  const today = getZonedParts(now, timeZone);
  const result: Interval[] = [];
  for (let offset = 0; offset < BOOKING_HORIZON_DAYS; offset++) {
    const date = addDays(today, offset);
    if (!OPEN_WEEKDAYS.includes(weekdayOf(date))) continue;
    for (let m = FIRST_SLOT_MINUTES; m <= LAST_SLOT_MINUTES; m += SLOT_STEP_MINUTES) {
      const startsAt = zonedTimeToUtc(
        { ...date, hour: Math.floor(m / 60), minute: m % 60 },
        timeZone,
      );
      if (startsAt <= now) continue; // прошедшее время
      result.push({ startsAt, endsAt: new Date(startsAt.getTime() + SLOT_STEP_MINUTES * MINUTE) });
    }
  }
  return result;
}

// Подходящий стол: активный, вмещает компанию, свободен на окно. Берём наименьший по вместимости.
export function pickTable(
  tables: TableLite[],
  activeBookings: ActiveBookingLite[],
  window: Interval,
  partySize: number,
): TableLite | null {
  const busy = new Set(
    activeBookings.filter((b) => overlaps(b, window)).map((b) => b.tableId),
  );
  const fitting = tables
    .filter((t) => t.isActive && t.capacity >= partySize && !busy.has(t.id))
    .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name, "ru"));
  return fitting[0] ?? null;
}

export interface AvailableWindow extends Interval {
  tableId: string;
}

export interface AvailabilityInput {
  now: Date;
  timeZone: string;
  partySize: number;
  tables: TableLite[];
  activeBookings: ActiveBookingLite[];
  closedStarts: Date[]; // окна, закрытые администратором (Slot.isClosed = true)
}

// Доступные окна: правила календаря, не прошедшее время, не закрыто админом, есть подходящий свободный стол.
export function availableWindows(input: AvailabilityInput): AvailableWindow[] {
  const { now, timeZone, partySize, tables, activeBookings, closedStarts } = input;
  if (!Number.isInteger(partySize) || partySize < MIN_PARTY_SIZE || partySize > MAX_PARTY_SIZE) {
    return [];
  }
  const closed = new Set(closedStarts.map((d) => d.getTime()));
  const result: AvailableWindow[] = [];
  for (const window of candidateWindows(now, timeZone)) {
    if (closed.has(window.startsAt.getTime())) continue;
    const table = pickTable(tables, activeBookings, window, partySize);
    if (table) result.push({ ...window, tableId: table.id });
  }
  return result;
}

// У пользователя уже есть активная бронь, пересекающаяся с окном.
export function userHasConflict(
  userActiveBookings: Interval[],
  window: Interval,
): boolean {
  return userActiveBookings.some((b) => overlaps(b, window));
}

// ---- Отмена и машина состояний ----
export function canOwnerCancel(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= OWNER_CANCEL_DEADLINE_HOURS * 60 * MINUTE;
}

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function allowedNextStatuses(from: BookingStatus): BookingStatus[] {
  return TRANSITIONS[from];
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: "invalid_transition" | "forbidden" | "deadline_passed" };

export interface TransitionInput {
  from: BookingStatus;
  to: BookingStatus;
  actorRole: Role;
  actorIsOwner: boolean;
  startsAt: Date;
  now: Date;
}

export function checkTransition(input: TransitionInput): TransitionResult {
  const { from, to, actorRole, actorIsOwner, startsAt, now } = input;
  if (!TRANSITIONS[from].includes(to)) return { ok: false, reason: "invalid_transition" };

  const isStaff = actorRole === "admin" || actorRole === "super_admin";
  if (isStaff) return { ok: true };

  // Обычный пользователь: только отмена своей брони до дедлайна.
  if (!actorIsOwner || to !== "cancelled") return { ok: false, reason: "forbidden" };
  if (!canOwnerCancel(startsAt, now)) return { ok: false, reason: "deadline_passed" };
  return { ok: true };
}
