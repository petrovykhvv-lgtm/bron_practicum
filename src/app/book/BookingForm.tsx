"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { InlineLoading } from "@/components/ui/Loading";
import { Notice } from "@/components/ui/Notice";
import { MAX_PARTY_SIZE, MIN_PARTY_SIZE } from "@/lib/booking/rules";

interface Win {
  startsAt: string;
  date: string;
  dateLabel: string;
  time: string;
}

const PARTY_OPTIONS = Array.from({ length: MAX_PARTY_SIZE - MIN_PARTY_SIZE + 1 }, (_, i) => MIN_PARTY_SIZE + i);

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 font-serif text-2xl font-semibold">
        <span className="vm-icon-disc vm-icon-disc-green font-sans text-sm font-bold" style={{ width: 28, height: 28 }}>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

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
  const chosen = (windows ?? []).find((w) => w.startsAt === startsAt);

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
    <div className="vm-card flex w-full max-w-3xl flex-col gap-8" style={{ padding: "clamp(20px, 4vw, 36px)" }}>
      <Step n={1} title="Сколько вас будет">
        <div className="max-w-xs">
          <label className="vm-label" htmlFor="partySize">Количество гостей</label>
          <select id="partySize" className="vm-input" value={partySize} onChange={(e) => changePartySize(Number(e.target.value))}>
            {PARTY_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </Step>

      <Step n={2} title="Выберите дату">
        {windows === null ? (
          <InlineLoading text="Загружаем доступное время…" />
        ) : days.length === 0 ? (
          <EmptyState icon="calendar" title="Свободных столов нет">
            На ближайшие две недели нет свободного стола для {partySize} гостей. Попробуйте изменить число гостей.
          </EmptyState>
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
                className={`vm-btn vm-btn-sm ${date === key ? "vm-btn-primary" : "vm-btn-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Step>

      {times.length > 0 && (
        <Step n={3} title="Выберите время">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Время">
            {times.map((w) => (
              <button
                key={w.startsAt}
                type="button"
                role="radio"
                aria-checked={startsAt === w.startsAt}
                onClick={() => setStartsAt(w.startsAt)}
                className={`vm-btn ${startsAt === w.startsAt ? "vm-btn-primary" : "vm-btn-secondary"}`}
              >
                {w.time}
              </button>
            ))}
          </div>
        </Step>
      )}

      {windows !== null && days.length > 0 && (
        <Step n={4} title="Пожелания">
          <div>
            <label className="vm-label" htmlFor="comment">Комментарий (необязательно)</label>
            <textarea id="comment" className="vm-input" style={{ height: 96 }} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
            <p className="vm-hint">{comment.length}/300</p>
          </div>
        </Step>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {windows !== null && days.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--vm-hairline)] pt-6">
          {chosen ? (
            <div className="flex flex-wrap gap-2">
              <Chip icon="calendar" label="Когда">{chosen.dateLabel}, {chosen.time}</Chip>
              <Chip icon="users" label="Гостей">{partySize}</Chip>
            </div>
          ) : (
            <p className="text-sm text-vm-muted">Выберите дату и время, чтобы продолжить.</p>
          )}
          <button type="button" className="vm-btn vm-btn-primary" disabled={!startsAt || busy} onClick={submit}>
            {busy ? (
              <>
                <span className="vm-spinner vm-spinner-light" aria-hidden="true" /> Отправляем…
              </>
            ) : (
              <>
                Забронировать <Icon name="arrow" size={18} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
