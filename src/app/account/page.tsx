import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { denied } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Профиль" title={<>Личный <em>кабинет</em></>} />
      {denied && <Notice kind="error" className="max-w-xl">Недостаточно прав для этого раздела.</Notice>}
      <section className="vm-card flex max-w-xl flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="vm-icon-disc vm-icon-disc-green font-serif text-2xl font-bold" style={{ width: 56, height: 56 }}>
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="font-serif text-3xl font-semibold">{user.name}</p>
            <p className="text-sm text-vm-muted">{user.email}</p>
          </div>
        </div>
        <p>
          <span className="vm-badge bg-vm-green-tint text-vm-green">{ROLE_LABELS[user.role]}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/book" className="vm-btn vm-btn-primary vm-btn-sm">Забронировать</Link>
          <Link href="/bookings" className="vm-btn vm-btn-secondary vm-btn-sm">Мои брони</Link>
          <Link href="/notifications" className="vm-btn vm-btn-secondary vm-btn-sm">Уведомления</Link>
          {can(user.role, "booking:view_all") && (
            <Link href="/admin" className="vm-btn vm-btn-secondary vm-btn-sm">Администрирование</Link>
          )}
        </div>
      </section>
    </div>
  );
}
