import { z } from "zod";
import { parseDateKey } from "./service";

const dateKey = z
  .string()
  .refine((v) => parseDateKey(v) !== null, "Дата в формате ГГГГ-ММ-ДД");

const status = z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]);

// Пустые значения формы фильтров (?status=) трактуем как «не задано».
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const bookingFilterSchema = z
  .object({
    status: z.preprocess(emptyToUndefined, status.optional()),
    from: z.preprocess(emptyToUndefined, dateKey.optional()),
    to: z.preprocess(emptyToUndefined, dateKey.optional()),
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10000).optional()),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Дата «с» не может быть позже даты «по»", path: ["to"] });

export const statusChangeSchema = z.object({ status });

export const tableChangeSchema = z.object({ tableId: z.string().trim().min(1, "Выберите стол").max(64) });

export const slotChangeSchema = z.object({
  startsAt: z.iso.datetime("Некорректное время"),
  closed: z.boolean(),
  reason: z.string().trim().max(200, "Причина не длиннее 200 символов").optional(),
});

export const auditQuerySchema = z.object({
  entityType: z.preprocess(emptyToUndefined, z.enum(["Booking", "Slot", "User"]).optional()),
  entityId: z.preprocess(emptyToUndefined, z.string().min(1).max(64).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(300).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10000).optional()),
});
