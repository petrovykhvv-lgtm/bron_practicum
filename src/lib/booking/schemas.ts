import { z } from "zod";
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE } from "./rules";

// Границы числа гостей — те же константы, что в форме и в CHECK базы данных.
const partySize = z
  .number("Укажите число гостей")
  .int("Число гостей должно быть целым")
  .min(MIN_PARTY_SIZE, `Минимум гостей: ${MIN_PARTY_SIZE}`)
  .max(MAX_PARTY_SIZE, `Максимум гостей: ${MAX_PARTY_SIZE}`);

export const createBookingSchema = z.object({
  startsAt: z.iso.datetime("Некорректное время"),
  partySize,
  comment: z
    .string()
    .trim()
    .max(300, "Комментарий не длиннее 300 символов")
    .optional()
    .transform((value) => value || undefined),
});

export const availabilityQuerySchema = z.object({
  partySize: z.coerce.number("Укажите число гостей").pipe(partySize),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
