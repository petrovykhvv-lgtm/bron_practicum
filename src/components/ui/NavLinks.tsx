"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  badge?: string;
  exact?: boolean;
}

// Навигация одного вида и для шапки, и для разделов админки: активный пункт — зелёная капсула.
export function NavLinks({ items, label, className = "" }: { items: NavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="vm-navlink">
            {item.label}
            {item.badge && (
              <span className="ml-2 rounded-full bg-vm-gold px-2 text-xs font-bold text-vm-ink">{item.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
