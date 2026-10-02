"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Подтверждение действия в стиле интерфейса вместо window.confirm. Нативный <dialog>:
// фокус заперт внутри, Escape отменяет, фон не кликается.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="vm-dialog"
      aria-labelledby="vm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="flex flex-col gap-4">
        <h2 id="vm-dialog-title" className="text-2xl font-semibold">
          {title}
        </h2>
        {children && <div className="text-sm text-vm-muted">{children}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="vm-btn vm-btn-secondary vm-btn-sm" onClick={onCancel} disabled={busy}>
            Назад
          </button>
          <button
            type="button"
            className={`vm-btn vm-btn-sm ${danger ? "vm-btn-danger" : "vm-btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Подождите…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
