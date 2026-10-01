import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { LogoutButton } from "./LogoutButton";

export async function SiteHeader() {
  const user = await getCurrentUser();
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
              {can(user.role, "user:list") && (
                <Link href="/admin/users" className={linkClass}>
                  Пользователи
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
