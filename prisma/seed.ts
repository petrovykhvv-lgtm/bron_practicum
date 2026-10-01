// Контрольные данные для локального запуска. Повторный запуск безопасен:
// пользователи и столы обновляются по ключу, демо-брони создаются только в пустой таблице бронирований.
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { candidateWindows, pickTable, SLOT_STEP_MINUTES, type Interval } from "../src/lib/booking/rules";
import { addDays, getZonedParts, weekdayOf, zonedTimeToUtc } from "../src/lib/booking/tz";
import type { BookingStatus, Role } from "../src/generated/prisma/client";

const prisma = createPrismaClient();
const TZ = process.env.RESTAURANT_TZ ?? "Europe/Moscow";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} не задан. Скопируйте .env.example в .env`);
  return value;
}

const TABLES = [
  { name: "Стол 1", capacity: 2 },
  { name: "Стол 2", capacity: 2 },
  { name: "Стол 3", capacity: 2 },
  { name: "Стол 4", capacity: 4 },
  { name: "Стол 5", capacity: 4 },
  { name: "Стол 6", capacity: 4 },
  { name: "Стол 7", capacity: 6 },
  { name: "Стол 8", capacity: 8 },
];

// Прошедшее окно в рабочий день: ищем назад от сегодня.
function pastWindow(now: Date, daysBack: number, hour: number, minute: number): Interval {
  const today = getZonedParts(now, TZ);
  let found = 0;
  for (let offset = 1; offset <= 30; offset++) {
    const date = addDays(today, -offset);
    if (weekdayOf(date) === 1) continue; // понедельник выходной
    found++;
    if (found === daysBack) {
      const startsAt = zonedTimeToUtc({ ...date, hour, minute }, TZ);
      return { startsAt, endsAt: new Date(startsAt.getTime() + SLOT_STEP_MINUTES * 60_000) };
    }
  }
  throw new Error("pastWindow: не удалось подобрать дату");
}

async function main() {
  const now = new Date();
  const demoPassword = requireEnv("SEED_DEMO_PASSWORD");

  const people: { email: string; name: string; role: Role; password: string }[] = [
    {
      email: requireEnv("SEED_SUPER_ADMIN_EMAIL").toLowerCase(),
      name: "Супер Администратор",
      role: "super_admin",
      password: requireEnv("SEED_SUPER_ADMIN_PASSWORD"),
    },
    { email: "admin@verdemarea.local", name: "Мария Администратор", role: "admin", password: demoPassword },
    { email: "guest1@verdemarea.local", name: "Анна Гостева", role: "user", password: demoPassword },
    { email: "guest2@verdemarea.local", name: "Иван Гостев", role: "user", password: demoPassword },
  ];

  const users: Record<string, { id: string; role: Role }> = {};
  for (const p of people) {
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (existing) {
      // Пароль и роль уже заведённого пользователя seed не меняет.
      users[p.email] = { id: existing.id, role: existing.role };
      continue;
    }
    const created = await prisma.user.create({
      data: { email: p.email, name: p.name, role: p.role, passwordHash: await hashPassword(p.password) },
    });
    await prisma.auditLog.create({
      data: {
        actorId: created.id,
        action: "user_registered",
        entityType: "User",
        entityId: created.id,
        after: { email: created.email, role: created.role },
      },
    });
    users[p.email] = { id: created.id, role: created.role };
  }

  for (const t of TABLES) {
    await prisma.table.upsert({
      where: { name: t.name },
      update: { capacity: t.capacity },
      create: { name: t.name, capacity: t.capacity },
    });
  }

  if ((await prisma.booking.count()) > 0) {
    console.log("seed: бронирования уже есть, демо-брони пропущены");
    return;
  }

  const tables = await prisma.table.findMany();
  const adminId = users["admin@verdemarea.local"].id;
  const guest1 = users["guest1@verdemarea.local"].id;
  const guest2 = users["guest2@verdemarea.local"].id;
  const future = candidateWindows(now, TZ);

  const plan: { userId: string; window: Interval; partySize: number; status: BookingStatus; comment?: string }[] = [
    { userId: guest1, window: future[2], partySize: 2, status: "pending", comment: "Столик у окна, если возможно" },
    { userId: guest1, window: future[6], partySize: 4, status: "confirmed" },
    { userId: guest2, window: future[3], partySize: 6, status: "pending" },
    { userId: guest2, window: future[1], partySize: 2, status: "cancelled" },
    { userId: guest1, window: pastWindow(now, 2, 18, 0), partySize: 2, status: "completed" },
    { userId: guest2, window: pastWindow(now, 3, 19, 30), partySize: 4, status: "no_show" },
  ];

  const created: { id: string; userId: string; status: BookingStatus }[] = [];
  for (const item of plan) {
    const active = await prisma.booking.findMany({
      where: { status: { in: ["pending", "confirmed"] } },
      select: { tableId: true, userId: true, startsAt: true, endsAt: true },
    });
    // Прошедшие брони завершены или не состоялись и столы не занимают, подбираем стол по активным.
    const table = pickTable(tables, active, item.window, item.partySize);
    if (!table) throw new Error("seed: нет свободного стола для демо-брони");
    const booking = await prisma.booking.create({
      data: {
        userId: item.userId,
        tableId: table.id,
        startsAt: item.window.startsAt,
        endsAt: item.window.endsAt,
        partySize: item.partySize,
        status: item.status,
        comment: item.comment,
      },
    });
    created.push({ id: booking.id, userId: item.userId, status: item.status });
    await prisma.auditLog.create({
      data: {
        actorId: item.userId,
        action: "booking_created",
        entityType: "Booking",
        entityId: booking.id,
        after: { status: "pending", tableId: table.id, startsAt: item.window.startsAt.toISOString() },
      },
    });
    await prisma.notification.create({
      data: {
        userId: item.userId,
        bookingId: booking.id,
        type: "booking_created",
        title: "Заявка принята",
        body: "Мы получили вашу заявку на бронирование. Администратор подтвердит её в ближайшее время.",
      },
    });
    if (item.status !== "pending") {
      await prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: "booking_status_changed",
          entityType: "Booking",
          entityId: booking.id,
          before: { status: "pending" },
          after: { status: item.status },
        },
      });
      const titles: Partial<Record<BookingStatus, [string, string, "booking_confirmed" | "booking_cancelled" | "booking_completed" | "booking_no_show"]>> = {
        confirmed: ["Бронь подтверждена", "Ждём вас в Verde Marea.", "booking_confirmed"],
        cancelled: ["Бронь отменена", "Бронирование отменено.", "booking_cancelled"],
        completed: ["Спасибо за визит", "Будем рады видеть вас снова.", "booking_completed"],
        no_show: ["Гость не пришёл", "Вы не пришли на бронирование.", "booking_no_show"],
      };
      const t = titles[item.status];
      if (t) {
        await prisma.notification.create({
          data: { userId: item.userId, bookingId: booking.id, type: t[2], title: t[0], body: t[1] },
        });
      }
    }
  }
  console.log(`seed: пользователей ${people.length}, столов ${TABLES.length}, броней ${created.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
