import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

const KINDS = {
  success: { icon: "check", cls: "vm-notice-success", role: "status", color: "var(--vm-green)" },
  info: { icon: "info", cls: "vm-notice-info", role: "status", color: "var(--vm-gold-ink)" },
  warn: { icon: "alert", cls: "vm-notice-warn", role: "status", color: "var(--vm-gold-ink)" },
  error: { icon: "alert", cls: "vm-notice-error", role: "alert", color: "var(--vm-danger)" },
} as const satisfies Record<string, { icon: IconName; cls: string; role: string; color: string }>;

// Единое оформление сообщений: успех, пояснение, предупреждение, ошибка.
export function Notice({ kind = "info", children, className = "" }: { kind?: keyof typeof KINDS; children: ReactNode; className?: string }) {
  const k = KINDS[kind];
  return (
    <div role={k.role} className={`vm-notice ${k.cls} ${className}`}>
      <span style={{ color: k.color }} className="mt-0.5 flex-none">
        <Icon name={k.icon} size={18} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
