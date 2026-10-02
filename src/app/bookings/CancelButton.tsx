"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Не удалось отменить бронь");
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="vm-btn vm-btn-danger-outline vm-btn-sm" disabled={busy} onClick={() => setOpen(true)}>
        Отменить
      </button>
      {error && (
        <p role="alert" className="vm-error max-w-60 text-right">
          {error}
        </p>
      )}
      <ConfirmDialog open={open} title="Отменить бронь?" confirmLabel="Отменить бронь" danger busy={busy} onConfirm={cancel} onCancel={() => setOpen(false)}>
        Стол освободится. Если передумаете, придётся бронировать заново.
      </ConfirmDialog>
    </div>
  );
}
