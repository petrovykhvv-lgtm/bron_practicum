"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import type { SlotScheduleItem } from "@/lib/admin/service";

export function SlotsManager({ slots }: { slots: SlotScheduleItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string; date?: string } | null>(null);

  const days = useMemo(() => {
    const map = new Map<string, { label: string; items: SlotScheduleItem[] }>();
    for (const s of slots) {
      if (!map.has(s.date)) map.set(s.date, { label: s.dateLabel, items: [] });
      map.get(s.date)!.items.push(s);
    }
    return [...map.entries()];
  }, [slots]);

  async function apply(slot: SlotScheduleItem, closed: boolean) {
    setBusy(slot.startsAt);
    setNotice(null);
    const response = await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: slot.startsAt, closed, reason: closed ? reason : undefined }),
    });
    const body = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setNotice({ kind: "error", text: body?.error?.message ?? "Не удалось изменить окно" });
    } else if (closed && body.activeBookings > 0) {
      setNotice({
        kind: "warn",
        date: slot.date,
        text: `Окно ${slot.dateLabel}, ${slot.time} закрыто для новых броней, но в нём остаются активные брони: ${body.activeBookings}. Они не отменены, обработайте их вручную.`,
      });
    } else {
      setNotice({ kind: "ok", text: `Окно ${slot.dateLabel}, ${slot.time} ${closed ? "закрыто" : "открыто"}.` });
    }
    setEditing(null);
    setReason("");
    router.refresh();
  }


  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <Notice kind={notice.kind === "ok" ? "success" : notice.kind} className="max-w-3xl">
          {notice.text}{" "}
          {notice.date && (
            <Link className="font-semibold underline" href={`/admin/bookings?from=${notice.date}&to=${notice.date}`}>
              Показать брони дня
            </Link>
          )}
        </Notice>
      )}
      {days.map(([date, day]) => (
        <section key={date} className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">{day.label}</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {day.items.map((s) => (
              <li
                key={s.startsAt}
                className={`vm-card flex flex-col gap-3 ${s.closed ? "vm-card-muted" : ""}`}
                style={{ padding: 20 }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-serif text-2xl font-semibold">{s.time}</span>
                  <span className={`vm-badge ${s.closed ? "bg-vm-danger-tint text-vm-danger" : "bg-vm-green-tint text-vm-green"}`}>
                    <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.closed ? "var(--vm-danger)" : "var(--vm-green)" }} />
                    {s.closed ? "Закрыто" : "Открыто"}
                  </span>
                </div>
                <p className="text-sm text-vm-muted">
                  Броней: {s.activeBookings} · свободно столов: {s.freeTables}
                </p>
                {s.closed && s.reason && <p className="text-sm">Причина: {s.reason}</p>}
                {editing === s.startsAt ? (
                  <div className="flex flex-col gap-2">
                    <label className="vm-label" htmlFor={`reason-${s.startsAt}`}>Причина (необязательно)</label>
                    <input
                      id={`reason-${s.startsAt}`}
                      className="vm-input"
                      maxLength={200}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="vm-btn vm-btn-primary vm-btn-sm" disabled={busy === s.startsAt} onClick={() => apply(s, true)}>
                        Закрыть окно
                      </button>
                      <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" onClick={() => setEditing(null)}>
                        Не нужно
                      </button>
                    </div>
                  </div>
                ) : s.closed ? (
                  <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" disabled={busy === s.startsAt} onClick={() => apply(s, false)}>
                    Открыть
                  </button>
                ) : (
                  <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" onClick={() => { setEditing(s.startsAt); setReason(""); }}>
                    Закрыть…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
