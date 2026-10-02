import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// Пустой список: что произошло и что делать дальше.
export function EmptyState({ icon = "list", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="vm-empty">
      <span className="vm-icon-disc">
        <Icon name={icon} />
      </span>
      <p className="font-serif text-2xl font-semibold">{title}</p>
      {children && <p className="max-w-md text-sm text-vm-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
