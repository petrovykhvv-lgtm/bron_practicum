"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "./ui/Icon";
import { Notice } from "./ui/Notice";

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

  const field = (name: string, label: string, type: string, autoComplete: string, hint?: string) => (
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
        aria-describedby={fieldErrors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined}
      />
      {fieldErrors[name] ? (
        <p id={`${name}-error`} className="vm-error">
          {fieldErrors[name]}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="vm-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="vm-card flex w-full max-w-md flex-col gap-5" noValidate style={{ padding: 32 }}>
      <div className="flex flex-col gap-3">
        <span className="vm-icon-disc vm-icon-disc-green" style={{ width: 48, height: 48 }}>
          <Icon name="leaf" size={24} />
        </span>
        <span className="vm-eyebrow">{mode === "login" ? "С возвращением" : "Добро пожаловать"}</span>
        <h1 className="vm-title" style={{ fontSize: "2.5rem" }}>
          {mode === "login" ? "Вход" : "Регистрация"}
        </h1>
      </div>
      {mode === "register" && field("name", "Имя", "text", "name")}
      {field("email", "Email", "email", "email")}
      {field("password", "Пароль", "password", mode === "login" ? "current-password" : "new-password", mode === "register" ? "Не короче 8 символов." : undefined)}
      {formError && <Notice kind="error">{formError}</Notice>}
      <button type="submit" disabled={busy} className="vm-btn vm-btn-primary">
        {busy ? (
          <>
            <span className="vm-spinner vm-spinner-light" aria-hidden="true" /> Подождите…
          </>
        ) : mode === "login" ? (
          "Войти"
        ) : (
          "Создать аккаунт"
        )}
      </button>
    </form>
  );
}
