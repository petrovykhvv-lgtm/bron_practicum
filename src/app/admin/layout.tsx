import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "booking:view_all")) redirect("/account?denied=1");

  const items = [
    { href: "/admin", label: "Обзор", show: true },
    { href: "/admin/bookings", label: "Брони", show: can(user.role, "booking:view_all") },
    { href: "/admin/slots", label: "Окна записи", show: can(user.role, "slot:manage") },
    { href: "/admin/history", label: "История", show: can(user.role, "audit:view_bookings") },
    { href: "/admin/users", label: "Пользователи", show: can(user.role, "user:list") },
  ].filter((i) => i.show);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vm-line pb-3">
        <AdminNav items={items} />
        <span className="vm-badge bg-vm-gold-tint text-vm-ink">
          Ваша роль: {ROLE_LABELS[user.role]}
        </span>
      </div>
      {children}
    </div>
  );
}
