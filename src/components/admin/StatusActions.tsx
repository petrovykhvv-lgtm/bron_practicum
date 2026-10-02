"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BookingStatus } from "@/generated/prisma/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { STATUS_ACTION_LABELS } from "@/lib/labels";

const CONFIRM: Partial<Record<BookingStatus, { title: string; text: string; danger: boolean }>> = {
  cancelled: { title: "Отменить бронь?", text: "Гость получит уведомление. Стол освободится, вернуть бронь будет нельзя.", danger: true },
  no_show: { title: "Гость не пришёл?", text: "Статус конечный: изменить его потом нельзя. Гость получит уведомление.", danger: true },
  completed: { title: "Завершить визит?", text: "Статус конечный: изменить его потом нельзя.", danger: false },
};
const DESTRUCTIVE: BookingStatus[] = ["cancelled", "no_show"];

// Кнопки показывают только переходы, разрешённые машиной состояний; сервер перепроверяет каждый.
// Необратимые действия («Отменить», «Не пришёл») оформлены красным и отделены от обычных.
export function StatusActions({ bookingId, next, hint }: { bookingId: string; next: BookingStatus[]; hint?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<BookingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(status: BookingStatus) {
    setBusy(true);
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
    setBusy(false);
    setPending(null);
    router.refresh();
  }

  function ask(status: BookingStatus) {
    if (CONFIRM[status]) setPending(status);
    else void change(status);
  }

  if (next.length === 0 && !hint) return <span className="text-sm text-vm-muted">Статус конечный</span>;
  const regular = next.filter((s) => !DESTRUCTIVE.includes(s));
  const destructive = next.filter((s) => DESTRUCTIVE.includes(s));
  const dialog = pending ? CONFIRM[pending] : undefined;

  return (
    <div className="flex flex-col gap-2">
      {regular.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {regular.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => ask(status)}
              className={`vm-btn vm-btn-sm ${status === "confirmed" ? "vm-btn-primary" : "vm-btn-secondary"}`}
            >
              {STATUS_ACTION_LABELS[status]}
            </button>
          ))}
        </div>
      )}
      {destructive.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Необратимые действия">
          {destructive.map((status) => (
            <button key={status} type="button" disabled={busy} onClick={() => ask(status)} className="vm-btn vm-btn-sm vm-btn-danger-outline">
              {STATUS_ACTION_LABELS[status]}
            </button>
          ))}
        </div>
      )}
      {hint && <p className="text-xs text-vm-muted">{hint}</p>}
      {error && (
        <p role="alert" className="vm-error">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={dialog?.title ?? ""}
        confirmLabel={pending ? STATUS_ACTION_LABELS[pending] : "Да"}
        danger={dialog?.danger}
        busy={busy}
        onConfirm={() => pending && change(pending)}
        onCancel={() => setPending(null)}
      >
        {dialog?.text}
      </ConfirmDialog>
    </div>
  );
}
