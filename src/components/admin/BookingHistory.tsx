"use client";

import { useState } from "react";

interface Entry {
  id: string;
  createdLabel: string;
  label: string;
  detail: string;
  actor: { name: string; role: string } | null;
}

export function BookingHistory({ bookingId }: { bookingId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setError(null);
    const response = await fetch(`/api/admin/audit?entityId=${encodeURIComponent(bookingId)}`);
    if (!response.ok) return setError("Не удалось загрузить историю");
    setEntries((await response.json()).entries);
  }

  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className="text-sm font-semibold text-vm-green hover:underline">
        {open ? "Скрыть историю" : "История"}
      </button>
      {open && (
        <div className="mt-2 rounded-md bg-vm-cream p-3">
          {error && <p className="vm-error">{error}</p>}
          {!error && entries === null && <p className="text-sm text-vm-muted">Загружаем…</p>}
          {entries && entries.length === 0 && <p className="text-sm text-vm-muted">Записей нет.</p>}
          {entries && entries.length > 0 && (
            <ol className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="font-semibold">{e.label}</span>
                  <span className="text-vm-muted"> · {e.createdLabel} · {e.actor ? e.actor.name : "система"}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
