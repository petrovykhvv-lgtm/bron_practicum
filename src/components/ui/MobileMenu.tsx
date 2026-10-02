"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Меню узких экранов. key по адресу страницы пересоздаёт <details> закрытым после каждого перехода.
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <details key={pathname} className="group relative xl:hidden">
      <summary className="vm-btn vm-btn-secondary vm-btn-sm list-none">{label}</summary>
      <div className="vm-glass vm-glass-strong absolute right-0 top-12 z-40 flex w-64 flex-col gap-1 p-3">{children}</div>
    </details>
  );
}
