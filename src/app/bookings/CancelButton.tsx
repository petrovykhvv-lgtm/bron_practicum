"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("Отменить бронь?")) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Не удалось отменить бронь");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" disabled={busy} onClick={cancel}>
        {busy ? "Отменяем…" : "Отменить"}
      </button>
      {error && (
        <p role="alert" className="vm-error max-w-60 text-right">
          {error}
        </p>
      )}
    </div>
  );
}
