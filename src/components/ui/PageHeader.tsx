import type { ReactNode } from "react";

// Заголовок экрана: метка-«eyebrow», крупный засечный заголовок, пояснение и действие справа.
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {eyebrow && <span className="vm-eyebrow">{eyebrow}</span>}
        <h1 className="vm-title">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-vm-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
