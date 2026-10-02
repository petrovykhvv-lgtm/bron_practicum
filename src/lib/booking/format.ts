import { getZonedParts } from "./tz";

const pad = (n: number) => String(n).padStart(2, "0");

// Ключ дня и время в поясе ресторана: клиент получает готовые строки и не считает часовые пояса сам.
export function localDateKey(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTime(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDateRu(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short", day: "numeric", month: "long" }).format(date);
}

export function formatDateTimeRu(date: Date, timeZone: string): string {
  return `${formatDateRu(date, timeZone)}, ${localTime(date, timeZone)}`;
}
