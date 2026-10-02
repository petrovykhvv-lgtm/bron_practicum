"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BookingStatus } from "@/generated/prisma/client";
import { STATUS_ACTION_LABELS } from "@/lib/labels";

const CONFIRM_TEXT: Partial<Record<BookingStatus, string>> = {
  cancelled: "Отменить бронь? Гость получит уведомление.",
  no_show: "Отметить, что гость не пришёл? Это конечный статус.",
  completed: "Завершить визит? Это конечный статус.",
};

// Кнопки показывают только переходы, разрешённые машиной состояний; сервер перепроверяет каждый.
export function StatusActions({ bookingId, next }: { bookingId: string; next: BookingStatus[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(status: BookingStatus) {
    const text = CONFIRM_TEXT[status];
    if (text && !window.confirm(text)) return;
    setBusy(status);
    setError(null);
    const response = await fetch(`/api/admin/bookings/${bookingId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Не удалось изменить статус");
    }
    setBusy(null);
    router.refresh();
  }

  if (next.length === 0) return <span className="text-sm text-vm-muted">Статус конечный</span>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {next.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy !== null}
            onClick={() => change(status)}
            className={`vm-btn vm-btn-sm ${status === "confirmed" ? "vm-btn-primary" : "vm-btn-secondary"}`}
          >
            {busy === status ? "…" : STATUS_ACTION_LABELS[status]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="vm-error">
          {error}
        </p>
      )}
    </div>
  );
}
