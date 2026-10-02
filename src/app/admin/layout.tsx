import { redirect } from "next/navigation";
import { NavLinks } from "@/components/ui/NavLinks";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "booking:view_all")) redirect("/account?denied=1");

  const items = [
    { href: "/admin", label: "Обзор", exact: true, show: true },
    { href: "/admin/bookings", label: "Брони", show: can(user.role, "booking:view_all") },
    { href: "/admin/floor", label: "План зала", show: can(user.role, "booking:view_all") },
    { href: "/admin/slots", label: "Окна записи", show: can(user.role, "slot:manage") },
    { href: "/admin/history", label: "История", show: can(user.role, "audit:view_bookings") },
    { href: "/admin/users", label: "Пользователи", show: can(user.role, "user:list") },
  ].filter((i) => i.show);

  return (
    <div className="vm-admin flex flex-col gap-8">
      <div className="vm-glass vm-glass-strong flex flex-wrap items-center justify-between gap-3 px-3 py-2" style={{ borderRadius: "var(--r-lg)" }}>
        <NavLinks items={items} label="Разделы администрирования" className="flex flex-wrap gap-1" />
        <span className="vm-badge bg-vm-gold-tint text-vm-ink">
          <Icon name="shield" size={14} /> Ваша роль: {ROLE_LABELS[user.role]}
        </span>
      </div>
      {children}
    </div>
  );
}
