import type { BookingStatus } from "@/generated/prisma/client";

// Бейджи статусов — design.md, раздел 5.
const STYLES: Record<BookingStatus, { label: string; bg: string; fg: string; dot: string }> = {
  pending: { label: "Ожидает", bg: "var(--vm-gold-tint)", fg: "var(--vm-ink)", dot: "var(--vm-gold)" },
  confirmed: { label: "Подтверждена", bg: "var(--vm-green-tint)", fg: "var(--vm-green)", dot: "var(--vm-green)" },
  cancelled: { label: "Отменена", bg: "#ece9e1", fg: "var(--vm-muted)", dot: "var(--vm-muted)" },
  completed: { label: "Завершена", bg: "var(--vm-green)", fg: "var(--vm-cream)", dot: "var(--vm-gold)" },
  no_show: { label: "Не пришёл", bg: "var(--vm-danger-tint)", fg: "var(--vm-danger)", dot: "var(--vm-danger)" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STYLES[status];
  return (
    <span className="vm-badge inline-flex items-center gap-2" style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}
