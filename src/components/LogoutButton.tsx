"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} disabled={busy} className="vm-btn vm-btn-secondary vm-btn-sm">
      {busy ? "Выходим…" : "Выйти"}
    </button>
  );
}
