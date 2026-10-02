"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Пересадка: выбор из столов, которые подходят по вместимости и свободны на это время (список считает сервер).
export function TableReassign({ bookingId, currentName, options }: { bookingId: string; currentName: string; options: { id: string; name: string; capacity: number }[] }) {
  const router = useRouter();
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) return null;

  async function reseat() {
    if (!tableId) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/bookings/${bookingId}/table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Не удалось сменить стол");
    } else {
      setTableId("");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`table-${bookingId}`}>Новый стол вместо {currentName}</label>
        <select id={`table-${bookingId}`} className="vm-input" style={{ minHeight: 36, width: "auto", padding: "0 12px", fontSize: 14 }} value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="">Пересадить за…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.capacity})
            </option>
          ))}
        </select>
        <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" disabled={!tableId || busy} onClick={reseat}>
          {busy ? "…" : "Пересадить"}
        </button>
      </div>
      {error && (
        <p role="alert" className="vm-error">
          {error}
        </p>
      )}
    </div>
  );
}
