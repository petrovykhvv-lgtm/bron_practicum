"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE } from "@/lib/booking/rules";

interface Win {
  startsAt: string;
  date: string;
  dateLabel: string;
  time: string;
}

const PARTY_OPTIONS = Array.from({ length: MAX_PARTY_SIZE - MIN_PARTY_SIZE + 1 }, (_, i) => MIN_PARTY_SIZE + i);

// Форма показывает только то, что вернул сервер (окна по правилам). Клиент ничего не вычисляет сам,
// а сервер всё равно перепроверяет выбор при создании брони.
export function BookingForm() {
  const router = useRouter();
  const [partySize, setPartySize] = useState(2);
  const [windows, setWindows] = useState<Win[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/availability?partySize=${partySize}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const list: Win[] = body.windows ?? [];
        setWindows(list);
        setDate((prev) => (prev && list.some((w) => w.date === prev) ? prev : (list[0]?.date ?? null)));
      })
      .catch(() => !cancelled && setError("Не удалось загрузить доступное время"));
    return () => {
      cancelled = true;
    };
  }, [partySize]);

  function changePartySize(next: number) {
    setPartySize(next);
    setWindows(null);
    setStartsAt(null);
    setError(null);
  }

  const days = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of windows ?? []) if (!map.has(w.date)) map.set(w.date, w.dateLabel);
    return [...map.entries()];
  }, [windows]);
  const times = (windows ?? []).filter((w) => w.date === date);

  async function submit() {
    if (!startsAt) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt, partySize, comment }),
    });
    if (response.ok) {
      router.push("/bookings?created=1");
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => null);
    setError(body?.error?.details?.comment ?? body?.error?.message ?? "Не удалось создать бронь");
    setBusy(false);
    // Выбор мог устареть (стол заняли): обновим список окон.
    const fresh = await fetch(`/api/availability?partySize=${partySize}`).then((r) => r.json()).catch(() => null);
    if (fresh?.windows) {
      setWindows(fresh.windows);
      setStartsAt(null);
    }
  }

  return (
    <div className="vm-card flex w-full max-w-2xl flex-col gap-6">
      <div>
        <label className="vm-label" htmlFor="partySize">
          Количество гостей
        </label>
        <select
          id="partySize"
          className="vm-input"
          value={partySize}
          onChange={(e) => changePartySize(Number(e.target.value))}
        >
          {PARTY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="vm-label">Дата</span>
        {windows === null ? (
          <p className="text-sm text-vm-muted">Загружаем доступное время…</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-vm-muted">
            На ближайшие две недели свободных столов для {partySize} гостей нет. Попробуйте изменить число гостей.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Дата">
            {days.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={date === key}
                onClick={() => {
                  setDate(key);
                  setStartsAt(null);
                }}
                className={`vm-btn ${date === key ? "vm-btn-primary" : "vm-btn-secondary"}`}
                style={{ padding: "0 16px" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {times.length > 0 && (
        <div>
          <span className="vm-label">Время</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Время">
            {times.map((w) => (
              <button
                key={w.startsAt}
                type="button"
                role="radio"
                aria-checked={startsAt === w.startsAt}
                onClick={() => setStartsAt(w.startsAt)}
                className={`vm-btn ${startsAt === w.startsAt ? "vm-btn-primary" : "vm-btn-secondary"}`}
                style={{ padding: "0 20px" }}
              >
                {w.time}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="vm-label" htmlFor="comment">
          Комментарий (необязательно)
        </label>
        <textarea
          id="comment"
          className="vm-input"
          style={{ height: 88, padding: 12 }}
          maxLength={300}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-vm-danger-tint px-3 py-2 text-sm text-vm-danger">
          {error}
        </p>
      )}

      <button type="button" className="vm-btn vm-btn-primary" disabled={!startsAt || busy} onClick={submit}>
        {busy ? "Отправляем…" : "Забронировать"}
      </button>
    </div>
  );
}
