"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      router.push("/account");
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => null);
    setFieldErrors(body?.error?.details ?? {});
    setFormError(body?.error?.message ?? "Не удалось выполнить запрос");
    setBusy(false);
  }

  const field = (name: string, label: string, type: string, autoComplete: string) => (
    <div>
      <label className="vm-label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="vm-input"
        aria-invalid={fieldErrors[name] ? true : undefined}
        aria-describedby={fieldErrors[name] ? `${name}-error` : undefined}
      />
      {fieldErrors[name] && (
        <p id={`${name}-error`} className="vm-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="vm-card flex w-full max-w-md flex-col gap-4" noValidate>
      <h1 className="text-4xl font-bold">{mode === "login" ? "Вход" : "Регистрация"}</h1>
      {mode === "register" && field("name", "Имя", "text", "name")}
      {field("email", "Email", "email", "email")}
      {field("password", "Пароль", "password", mode === "login" ? "current-password" : "new-password")}
      {mode === "register" && <p className="text-xs text-vm-muted">Не короче 8 символов.</p>}
      {formError && (
        <p role="alert" className="rounded-md bg-vm-danger-tint px-3 py-2 text-sm text-vm-danger">
          {formError}
        </p>
      )}
      <button type="submit" disabled={busy} className="vm-btn vm-btn-primary">
        {busy ? "Подождите…" : mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  );
}
