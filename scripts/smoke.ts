// Сквозная проверка основного сценария на запущенном сервере:
// регистрация → вход → бронирование → уведомления → административный сценарий → смена роли → история.
// Запуск: сервер должен работать (npm run dev или npm start), затем `npm run smoke`.
// Адрес: SMOKE_BASE_URL (по умолчанию http://localhost:3000). Учётные данные ролей берутся из .env (seed).
// Скрипт создаёт пользователя smoke.<время>@verdemarea.local; после него бронь отменена, окно открыто, роль возвращена.
import "dotenv/config";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SUPER_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "";
const SUPER_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

// Ответы API в сквозной проверке читаются свободно: форма проверяется самими проверками.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

class Client {
  private cookie = "";
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Loose; text: string }> {
    const response = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", Origin: BASE, ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";")[0];
      if (pair.startsWith("vm_session=")) this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await response.text();
    let json: Loose = null;
    try {
      json = JSON.parse(text);
    } catch {
      // не JSON: оставляем text
    }
    return { status: response.status, json, text };
  }
}

let failures = 0;
let total = 0;
function check(name: string, ok: boolean, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : detail ? `  → ${detail}` : ""}`);
}
const section = (title: string) => console.log(`\n${title}`);
const has = (list: Loose[], pred: (x: Loose) => boolean) => Array.isArray(list) && list.some(pred);

async function main() {
  if (!SUPER_EMAIL || !SUPER_PASSWORD || !DEMO_PASSWORD) {
    throw new Error("Нет SEED_* в .env: скопируйте .env.example в .env");
  }
  const guest = new Client();
  const admin = new Client();
  const boss = new Client();
  const anon = new Client();
  const email = `smoke.${Date.now()}@verdemarea.local`;
  const password = "Smoke-Test-Pass-1";

  section("1. Сервер и анонимный доступ");
  check("главная страница открывается", (await anon.call("GET", "/")).status === 200);
  const avail = await anon.call("GET", "/api/availability?partySize=2");
  check("доступные окна считаются", avail.status === 200 && avail.json.windows.length > 0, String(avail.status));
  check("аноним не видит админский API", (await anon.call("GET", "/api/admin/bookings")).status === 401);
  check("аноним не создаёт бронь", (await anon.call("POST", "/api/bookings", { startsAt: "2030-01-01T09:00:00Z", partySize: 2 })).status === 401);

  section("2. Регистрация и вход");
  const reg = await guest.call("POST", "/api/auth/register", { email, name: "Smoke Гость", password, role: "super_admin" });
  check("регистрация: 201, роль user (поле role игнорируется)", reg.status === 201 && reg.json.user.role === "user", reg.text.slice(0, 120));
  check("в ответе нет passwordHash", !reg.text.includes("passwordHash"));
  const guestId: string = reg.json?.user?.id;
  check("сессия открыта после регистрации", (await guest.call("GET", "/api/auth/me")).status === 200);
  check("выход закрывает сессию", (await guest.call("POST", "/api/auth/logout")).status === 200 && (await guest.call("GET", "/api/auth/me")).status === 401);
  check("неверный пароль: 401", (await guest.call("POST", "/api/auth/login", { email, password: "wrong-password" })).status === 401);
  const login = await guest.call("POST", "/api/auth/login", { email, password });
  check("вход с верным паролем: 200", login.status === 200 && !login.text.includes("passwordHash"));

  section("3. Бронирование гостя");
  const windows: Loose[] = (await guest.call("GET", "/api/availability?partySize=2")).json.windows;
  const target = windows[windows.length - 1];
  const spare = windows[windows.length - 4];
  check("окна только в будущем и по сетке 90 минут", windows.every((w) => new Date(w.startsAt) > new Date()) && windows.every((w) => /^(12:00|13:30|15:00|16:30|18:00|19:30|21:00)$/.test(w.time)));
  const created = await guest.call("POST", "/api/bookings", { startsAt: target.startsAt, partySize: 2, comment: "smoke" });
  check("бронь создана: 201, pending, стол назначен", created.status === 201 && created.json.booking.status === "pending" && !!created.json.booking.tableName, created.text.slice(0, 150));
  const bookingId: string = created.json?.booking?.id;
  check("вторая бронь на то же время: 409 user_conflict", (await guest.call("POST", "/api/bookings", { startsAt: target.startsAt, partySize: 3 })).json?.error?.code === "user_conflict");
  check("прошедшее время: 409", (await guest.call("POST", "/api/bookings", { startsAt: "2026-01-06T09:00:00.000Z", partySize: 2 })).status === 409);
  check("9 гостей: 400", (await guest.call("POST", "/api/bookings", { startsAt: target.startsAt, partySize: 9 })).status === 400);
  const mine = await guest.call("GET", "/api/bookings");
  check("бронь видна в «Мои брони» с признаком отмены", has(mine.json.bookings, (b) => b.id === bookingId && b.canCancel === true));
  const notes1 = await guest.call("GET", "/api/notifications");
  check("уведомление «Заявка принята» получено", has(notes1.json.notifications, (n) => n.type === "booking_created" && !n.read) && notes1.json.unread >= 1);
  check("гость не попадает в админский контур", (await guest.call("GET", "/api/admin/bookings")).status === 403 && (await guest.call("POST", `/api/admin/bookings/${bookingId}/status`, { status: "confirmed" })).status === 403);

  section("4. Административный сценарий (admin)");
  check("вход admin", (await admin.call("POST", "/api/auth/login", { email: "admin@verdemarea.local", password: DEMO_PASSWORD })).status === 200);
  const list = await admin.call("GET", "/api/admin/bookings?status=pending");
  const row = list.json?.bookings?.find((b: Loose) => b.id === bookingId);
  check("в списке по фильтру pending: гость, стол и допустимые переходы", !!row && row.guest.email === email && !!row.table.name && row.nextStatuses.join() === "confirmed,cancelled", JSON.stringify(row)?.slice(0, 150));
  check("фильтр по статусу no_show показывает seed-бронь со столом", has((await admin.call("GET", "/api/admin/bookings?status=no_show")).json.bookings, (b) => b.status === "no_show" && !!b.table.name));
  const day = target.date;
  check("фильтр по дате находит бронь", has((await admin.call("GET", `/api/admin/bookings?from=${day}&to=${day}`)).json.bookings, (b) => b.id === bookingId));
  check("подтверждение: 200", (await admin.call("POST", `/api/admin/bookings/${bookingId}/status`, { status: "confirmed" })).status === 200);
  check("повторное подтверждение: 409", (await admin.call("POST", `/api/admin/bookings/${bookingId}/status`, { status: "confirmed" })).status === 409);
  check("гость получил «Бронь подтверждена»", has((await guest.call("GET", "/api/notifications")).json.notifications, (n) => n.type === "booking_confirmed"));
  const cancel = await guest.call("POST", `/api/bookings/${bookingId}/cancel`);
  check("гость отменяет подтверждённую бронь до дедлайна", cancel.status === 200 && cancel.json.booking.status === "cancelled", cancel.text.slice(0, 120));
  check("из конечного статуса возврата нет", (await admin.call("POST", `/api/admin/bookings/${bookingId}/status`, { status: "confirmed" })).status === 409);
  check("освобождённое окно снова доступно", has((await guest.call("GET", "/api/availability?partySize=2")).json.windows, (w) => w.startsAt === target.startsAt));
  const close = await admin.call("PUT", "/api/admin/slots", { startsAt: spare.startsAt, closed: true, reason: "smoke" });
  check("окно закрыто администратором", close.status === 200);
  check("закрытое окно скрыто у гостей", !has((await guest.call("GET", "/api/availability?partySize=2")).json.windows, (w) => w.startsAt === spare.startsAt));
  check("бронь в закрытое окно: 409", (await guest.call("POST", "/api/bookings", { startsAt: spare.startsAt, partySize: 2 })).status === 409);
  check("окно открыто снова", (await admin.call("PUT", "/api/admin/slots", { startsAt: spare.startsAt, closed: false })).status === 200 && has((await guest.call("GET", "/api/availability?partySize=2")).json.windows, (w) => w.startsAt === spare.startsAt));

  section("5. Смена роли (super_admin) и история");
  check("admin не меняет роли: 403", (await admin.call("PATCH", `/api/admin/users/${guestId}/role`, { role: "admin" })).status === 403);
  check("вход super_admin", (await boss.call("POST", "/api/auth/login", { email: SUPER_EMAIL, password: SUPER_PASSWORD })).status === 200);
  const users = (await boss.call("GET", "/api/admin/users")).json.users as Loose[];
  const superUser = users.find((u) => u.role === "super_admin");
  check("список пользователей без passwordHash", !JSON.stringify(users).includes("passwordHash"));
  check("роль super_admin изменить нельзя: 403", (await boss.call("PATCH", `/api/admin/users/${superUser.id}/role`, { role: "user" })).status === 403);
  check("super_admin повышает гостя до admin", (await boss.call("PATCH", `/api/admin/users/${guestId}/role`, { role: "admin" })).status === 200);
  check("новая роль действует сразу: админский API доступен", (await guest.call("GET", "/api/admin/bookings")).status === 200);
  check("super_admin понижает обратно", (await boss.call("PATCH", `/api/admin/users/${guestId}/role`, { role: "user" })).status === 200);
  check("после понижения админский API закрыт", (await guest.call("GET", "/api/admin/bookings")).status === 403);

  const bossHistory = (await boss.call("GET", "/api/admin/audit?limit=300")).json.entries as Loose[];
  check("история (super_admin): регистрация", has(bossHistory, (e) => e.action === "user_registered" && e.entityId === guestId));
  check("история: создание брони гостем", has(bossHistory, (e) => e.action === "booking_created" && e.entityId === bookingId && e.actor?.email === email));
  check("история: подтверждение администратором", has(bossHistory, (e) => e.label === "Бронь подтверждена" && e.entityId === bookingId && e.actor?.email === "admin@verdemarea.local"));
  check("история: отмена гостем", has(bossHistory, (e) => e.label === "Бронь отменена гостем" && e.entityId === bookingId));
  check("история: закрытие и открытие окна", has(bossHistory, (e) => e.action === "slot_closed") && has(bossHistory, (e) => e.action === "slot_reopened"));
  const roleEntries = bossHistory.filter((e) => e.action === "user_role_changed" && e.entityId === guestId);
  check("история: две смены роли с автором super_admin", roleEntries.length === 2 && roleEntries.every((e) => e.actor?.email === SUPER_EMAIL), String(roleEntries.length));
  const adminHistory = (await admin.call("GET", "/api/admin/audit?limit=300")).json.entries as Loose[];
  check("admin видит брони и окна, но не роли и регистрации", has(adminHistory, (e) => e.entityType === "Booking") && !has(adminHistory, (e) => e.entityType === "User") && !has(adminHistory, (e) => e.action === "user_role_changed"));
  check("гость не видит историю: 403", (await guest.call("GET", "/api/admin/audit")).status === 403);

  console.log(`\n${failures === 0 ? "ГОТОВО" : "ЕСТЬ ОШИБКИ"}: проверок ${total}, не пройдено ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nПроверка прервана:", error instanceof Error ? error.message : error);
  console.error(`Сервер запущен по адресу ${BASE}? Выполнены ли миграции и seed?`);
  process.exit(2);
});
