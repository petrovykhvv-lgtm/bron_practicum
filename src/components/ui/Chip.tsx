import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// Чип с круглой иконкой: короткий факт (гости, стол, время).
export function Chip({ icon, label, children }: { icon: IconName; label?: string; children: ReactNode }) {
  return (
    <span className="vm-chip">
      <span className="vm-icon-disc">
        <Icon name={icon} size={18} />
      </span>
      <span>
        {label && <small>{label}</small>}
        {children}
      </span>
    </span>
  );
}
