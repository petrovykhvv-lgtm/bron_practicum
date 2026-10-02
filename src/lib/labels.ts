import type { BookingStatus, Role } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  user: "Гость",
  admin: "Администратор",
  super_admin: "Суперадминистратор",
};

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  completed: "Завершена",
  no_show: "Не пришёл",
};

// Подписи кнопок смены статуса в админке.
export const STATUS_ACTION_LABELS: Record<BookingStatus, string> = {
  pending: "Вернуть в ожидание",
  confirmed: "Подтвердить",
  cancelled: "Отменить",
  completed: "Завершить",
  no_show: "Не пришёл",
};
