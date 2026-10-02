"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" className="vm-btn vm-btn-secondary" disabled={busy} onClick={markAll}>
      Отметить всё прочитанным
    </button>
  );
}
