import { STATUS_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { BookingStatus, Role } from "@/generated/prisma/client";

// Описание записи истории человеческим языком. Без глаголов с родом: кто сделал — отдельное поле.
export interface AuditContext {
  actorId: string | null;
  booking?: { userId: string; guestName: string; when: string; partySize: number; tableName: string };
  targetUserName?: string;
}

export interface AuditEntryInput {
  action: string;
  before: unknown;
  after: unknown;
}

const field = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

function bookingText(ctx: AuditContext): string {
  const b = ctx.booking;
  return b ? `${b.when}, ${b.guestName}, гостей: ${b.partySize}, ${b.tableName}` : "бронь удалена или недоступна";
}

export function describeAudit(entry: AuditEntryInput, ctx: AuditContext): { label: string; detail: string } {
  switch (entry.action) {
    case "booking_created":
      return { label: "Создана бронь", detail: bookingText(ctx) };
    case "booking_status_changed": {
      const to = field(entry.after, "status") as BookingStatus | undefined;
      const from = field(entry.before, "status") as BookingStatus | undefined;
      const byGuest = ctx.booking && ctx.actorId === ctx.booking.userId;
      const labels: Partial<Record<BookingStatus, string>> = {
        confirmed: "Бронь подтверждена",
        cancelled: byGuest ? "Бронь отменена гостем" : "Бронь отменена рестораном",
        completed: "Бронь завершена",
        no_show: "Гость не пришёл",
      };
      const transition = from && to ? ` (${STATUS_LABELS[from]} → ${STATUS_LABELS[to]})` : "";
      return { label: (to && labels[to]) ?? "Изменён статус брони", detail: `${bookingText(ctx)}${transition}` };
    }
    case "booking_table_changed": {
      const from = field(entry.before, "tableName");
      const to = field(entry.after, "tableName");
      return { label: "Изменён стол брони", detail: `${bookingText(ctx)}${from && to ? ` (${String(from)} → ${String(to)})` : ""}` };
    }
    case "user_role_changed": {
      const from = field(entry.before, "role") as Role | undefined;
      const to = field(entry.after, "role") as Role | undefined;
      const change = from && to ? `${ROLE_LABELS[from]} → ${ROLE_LABELS[to]}` : "";
      return { label: "Изменена роль пользователя", detail: `${ctx.targetUserName ?? "пользователь удалён"}: ${change}` };
    }
    case "user_registered":
      return { label: "Регистрация пользователя", detail: ctx.targetUserName ?? String(field(entry.after, "email") ?? "") };
    case "slot_closed":
    case "slot_reopened": {
      const when = String(field(entry.after, "whenLabel") ?? "");
      const reason = field(entry.after, "reason");
      return {
        label: entry.action === "slot_closed" ? "Окно записи закрыто" : "Окно записи открыто",
        detail: reason ? `${when}. Причина: ${String(reason)}` : when,
      };
    }
    default:
      return { label: entry.action, detail: "" };
  }
}
