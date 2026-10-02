import { describe, expect, it } from "vitest";
import {
  availableWindows,
  candidateWindows,
  canOwnerCancel,
  checkTransition,
  pickTable,
  userHasConflict,
  type ActiveBookingLite,
  type TableLite,
} from "@/lib/booking/rules";
import { getZonedParts } from "@/lib/booking/tz";

const TZ = "Europe/Moscow";
// Среда 2026-10-07, 10:00 по Москве
const NOW = new Date("2026-10-07T07:00:00Z");

const tables: TableLite[] = [
  { id: "t2", name: "Стол 1", capacity: 2, isActive: true },
  { id: "t4", name: "Стол 4", capacity: 4, isActive: true },
  { id: "t8", name: "Стол 8", capacity: 8, isActive: true },
];

function local(date: Date) {
  const p = getZonedParts(date, TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

describe("candidateWindows", () => {
  const windows = candidateWindows(NOW, TZ);

  it("использует шаг 90 минут в диапазоне 12:00–21:00", () => {
    const times = new Set(windows.map((w) => local(w.startsAt).slice(11)));
    expect([...times].sort()).toEqual(["12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"]);
  });

  it("не содержит понедельников", () => {
    for (const w of windows) {
      const day = new Date(local(w.startsAt).slice(0, 10) + "T00:00:00Z").getUTCDay();
      expect(day).not.toBe(1);
    }
  });

  it("не содержит прошедшего времени (10:00 сегодня: 12:00 ещё доступно)", () => {
    expect(windows.every((w) => w.startsAt > NOW)).toBe(true);
    expect(local(windows[0].startsAt)).toBe("2026-10-07 12:00");
    const late = candidateWindows(new Date("2026-10-07T12:45:00Z"), TZ); // 15:45 по Москве
    expect(local(late[0].startsAt)).toBe("2026-10-07 16:30");
  });

  it("ограничено 14 днями, считая сегодня", () => {
    const last = windows[windows.length - 1];
    expect(local(last.startsAt).slice(0, 10)).toBe("2026-10-20");
    expect(windows.some((w) => local(w.startsAt).startsWith("2026-10-21"))).toBe(false);
  });

  it("окно длится 90 минут", () => {
    expect(windows[0].endsAt.getTime() - windows[0].startsAt.getTime()).toBe(90 * 60_000);
  });
});

describe("pickTable", () => {
  const window = candidateWindows(NOW, TZ)[0];

  it("выбирает наименьший подходящий по вместимости стол", () => {
    expect(pickTable(tables, [], window, 2)?.id).toBe("t2");
    expect(pickTable(tables, [], window, 3)?.id).toBe("t4");
    expect(pickTable(tables, [], window, 5)?.id).toBe("t8");
  });

  it("пропускает занятый стол и берёт следующий по вместимости", () => {
    const busy: ActiveBookingLite[] = [{ ...window, tableId: "t2", userId: "u1" }];
    expect(pickTable(tables, busy, window, 2)?.id).toBe("t4");
  });

  it("возвращает null, если подходящего стола нет", () => {
    expect(pickTable(tables, [], window, 9)).toBeNull();
    const busy: ActiveBookingLite[] = [{ ...window, tableId: "t8", userId: "u1" }];
    expect(pickTable(tables, busy, window, 8)).toBeNull();
  });

  it("не использует неактивные столы", () => {
    const off = tables.map((t) => (t.id === "t2" ? { ...t, isActive: false } : t));
    expect(pickTable(off, [], window, 2)?.id).toBe("t4");
  });
});

describe("availableWindows", () => {
  const base = { now: NOW, timeZone: TZ, tables, activeBookings: [], closedStarts: [] };

  it("скрывает окна, закрытые администратором", () => {
    const all = availableWindows({ ...base, partySize: 2 });
    const closed = [all[0].startsAt];
    const rest = availableWindows({ ...base, partySize: 2, closedStarts: closed });
    expect(rest.length).toBe(all.length - 1);
    expect(rest.some((w) => w.startsAt.getTime() === closed[0].getTime())).toBe(false);
  });

  it("скрывает окно, когда занят единственный подходящий стол", () => {
    const first = availableWindows({ ...base, partySize: 8 })[0];
    const busy: ActiveBookingLite[] = [{ ...first, tableId: "t8", userId: "u1" }];
    const rest = availableWindows({ ...base, partySize: 8, activeBookings: busy });
    expect(rest.some((w) => w.startsAt.getTime() === first.startsAt.getTime())).toBe(false);
  });

  it("возвращает пусто для недопустимого числа гостей", () => {
    expect(availableWindows({ ...base, partySize: 0 })).toEqual([]);
    expect(availableWindows({ ...base, partySize: 9 })).toEqual([]);
    expect(availableWindows({ ...base, partySize: 1.5 })).toEqual([]);
  });

  it("каждому окну назначает стол", () => {
    for (const w of availableWindows({ ...base, partySize: 4 })) expect(w.tableId).toBe("t4");
  });
});

describe("userHasConflict", () => {
  const w = candidateWindows(NOW, TZ);
  it("находит пересечение и не ругается на соседние окна", () => {
    expect(userHasConflict([w[0]], w[0])).toBe(true);
    expect(userHasConflict([w[0]], w[1])).toBe(false);
  });
});

describe("дедлайн отмены", () => {
  const start = new Date("2026-10-08T12:00:00Z");
  it("разрешает не позднее чем за 3 часа", () => {
    expect(canOwnerCancel(start, new Date("2026-10-08T09:00:00Z"))).toBe(true);
    expect(canOwnerCancel(start, new Date("2026-10-08T09:00:01Z"))).toBe(false);
  });
});

describe("машина состояний", () => {
  const start = new Date("2026-10-08T12:00:00Z");
  const early = new Date("2026-10-07T12:00:00Z");
  const late = new Date("2026-10-08T10:00:00Z");
  const after = new Date("2026-10-08T13:00:00Z"); // бронь уже началась
  const mk = (over: Partial<Parameters<typeof checkTransition>[0]>) =>
    checkTransition({ from: "pending", to: "confirmed", actorRole: "admin", actorIsOwner: false, startsAt: start, now: early, ...over });

  it("admin и super_admin выполняют допустимые переходы", () => {
    for (const actorRole of ["admin", "super_admin"] as const) {
      expect(mk({ actorRole }).ok).toBe(true);
      expect(mk({ actorRole, from: "confirmed", to: "completed", now: after }).ok).toBe(true);
      expect(mk({ actorRole, from: "confirmed", to: "no_show", now: after }).ok).toBe(true);
      expect(mk({ actorRole, from: "confirmed", to: "cancelled" }).ok).toBe(true);
    }
  });

  it("завершить и отметить «не пришёл» можно только после начала брони", () => {
    for (const actorRole of ["admin", "super_admin"] as const) {
      for (const to of ["completed", "no_show"] as const) {
        expect(mk({ actorRole, from: "confirmed", to, now: early })).toEqual({ ok: false, reason: "too_early" });
        expect(mk({ actorRole, from: "confirmed", to, now: start }).ok).toBe(true); // ровно в момент начала
      }
      expect(mk({ actorRole, from: "confirmed", to: "cancelled", now: early }).ok).toBe(true); // отмена возможна заранее
    }
  });

  it("конечные статусы не меняются", () => {
    for (const from of ["cancelled", "completed", "no_show"] as const) {
      expect(mk({ from, to: "confirmed" })).toEqual({ ok: false, reason: "invalid_transition" });
    }
  });

  it("запрещает недопустимые переходы", () => {
    expect(mk({ from: "pending", to: "completed" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mk({ from: "pending", to: "no_show" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(mk({ from: "confirmed", to: "pending" })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("владелец отменяет до дедлайна", () => {
    expect(mk({ actorRole: "user", actorIsOwner: true, to: "cancelled" }).ok).toBe(true);
    expect(mk({ actorRole: "user", actorIsOwner: true, from: "confirmed", to: "cancelled" }).ok).toBe(true);
  });

  it("владелец не отменяет после дедлайна, admin отменяет", () => {
    expect(mk({ actorRole: "user", actorIsOwner: true, to: "cancelled", now: late })).toEqual({ ok: false, reason: "deadline_passed" });
    expect(mk({ actorRole: "admin", to: "cancelled", now: late }).ok).toBe(true);
  });

  it("пользователь не меняет чужую бронь и не ставит другие статусы", () => {
    expect(mk({ actorRole: "user", actorIsOwner: false, to: "cancelled" })).toEqual({ ok: false, reason: "forbidden" });
    expect(mk({ actorRole: "user", actorIsOwner: true, to: "confirmed" })).toEqual({ ok: false, reason: "forbidden" });
    expect(mk({ actorRole: "user", actorIsOwner: true, from: "confirmed", to: "completed" })).toEqual({ ok: false, reason: "forbidden" });
  });
});
