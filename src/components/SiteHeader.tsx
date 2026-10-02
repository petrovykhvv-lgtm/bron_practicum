import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { countUnread } from "@/lib/booking/service";
import { can } from "@/lib/permissions";
import { LogoutButton } from "./LogoutButton";
import { Icon } from "./ui/Icon";
import { NavLinks, type NavItem } from "./ui/NavLinks";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await countUnread(prisma, user.id) : 0;

  const items: NavItem[] = user
    ? [
        { href: "/book", label: "Забронировать" },
        { href: "/bookings", label: "Мои брони" },
        { href: "/notifications", label: "Уведомления", badge: unread > 0 ? String(unread) : undefined },
        ...(can(user.role, "booking:view_all") ? [{ href: "/admin", label: "Администрирование" }] : []),
      ]
    : [];

  return (
    <div className="sticky top-0 z-30 px-3 pt-3 md:px-8 md:pt-4">
      <div className="vm-header mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-3 py-2 md:px-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Verde Marea, на главную">
          <span className="vm-icon-disc vm-icon-disc-green">
            <Icon name="leaf" />
          </span>
          <span className="whitespace-nowrap font-serif text-2xl font-bold text-vm-green">Verde Marea</span>
        </Link>

        <div className="hidden items-center gap-2 xl:flex">
          <NavLinks items={items} label="Основная навигация" className="flex items-center gap-1" />
          {user ? (
            <>
              <Link href="/account" className="vm-navlink max-w-[11rem]" aria-label="Личный кабинет">
                <span className="truncate">{user.name}</span>
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="vm-navlink">Войти</Link>
              <Link href="/register" className="vm-btn vm-btn-primary vm-btn-sm">Регистрация</Link>
            </>
          )}
        </div>

        <details className="group relative xl:hidden">
          <summary className="vm-btn vm-btn-secondary vm-btn-sm list-none">
            Меню{unread > 0 ? ` · ${unread}` : ""}
          </summary>
          <div className="vm-glass vm-glass-strong absolute right-0 top-12 z-40 flex w-64 flex-col gap-1 p-3">
            <NavLinks items={items} label="Основная навигация" className="flex flex-col gap-1" />
            {user ? (
              <>
                <Link href="/account" className="vm-navlink">{user.name}</Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="vm-navlink">Войти</Link>
                <Link href="/register" className="vm-btn vm-btn-primary vm-btn-sm">Регистрация</Link>
              </>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
