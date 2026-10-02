"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы администратора" className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              active ? "bg-vm-green text-vm-cream" : "text-vm-green hover:bg-vm-green-tint"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
