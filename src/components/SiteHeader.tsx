import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { countUnread } from "@/lib/booking/service";
import { can } from "@/lib/permissions";
import { LogoutButton } from "./LogoutButton";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await countUnread(prisma, user.id) : 0;
  const linkClass = "text-sm font-medium text-vm-cream hover:underline decoration-vm-gold underline-offset-4";
  return (
    <header className="bg-vm-green text-vm-cream">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
        <Link href="/" className="font-serif text-2xl font-bold">
          Verde Marea
        </Link>
        <nav className="flex flex-wrap items-center gap-4">
          {user ? (
            <>
              <Link href="/book" className={linkClass}>
                Забронировать
              </Link>
              <Link href="/bookings" className={linkClass}>
                Мои брони
              </Link>
              <Link href="/notifications" className={linkClass}>
                Уведомления{unread > 0 ? ` (${unread})` : ""}
              </Link>
              {can(user.role, "booking:view_all") && (
                <Link href="/admin" className={linkClass}>
                  Администрирование
                </Link>
              )}
              <Link href="/account" className={linkClass}>
                {user.name}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass}>
                Войти
              </Link>
              <Link href="/register" className={linkClass}>
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
