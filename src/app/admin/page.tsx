import Link from "next/link";
import { StatusActions } from "@/components/admin/StatusActions";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getAdminOverview } from "@/lib/admin/service";
import { requireStaffPage } from "@/lib/admin/guard";
import { ROLE_LABELS } from "@/lib/labels";
import { can, CAPABILITIES } from "@/lib/permissions";

export default async function AdminOverviewPage() {
  const user = await requireStaffPage("booking:view_all");
  const result = await getAdminOverview(prisma, { id: user.id, role: user.role }, new Date(), getRestaurantTz());
  if (!result.ok) return null;
  const o = result.data;

  const stat = (value: number, label: string, href: string, accent = false) => (
    <Link
      href={href}
      className="vm-card flex flex-col gap-1 transition-shadow hover:shadow-[var(--shadow-lift)]"
      style={accent && value > 0 ? { borderLeft: "4px solid var(--vm-gold)" } : undefined}
    >
      <span className="font-serif text-5xl font-bold text-vm-green">{value}</span>
      <span className="text-sm text-vm-muted">{label}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Администрирование" title={<>Обзор <em>смены</em></>} description="Что требует решения сейчас и как загружен зал." />

      <section aria-label="Показатели" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(o.pendingUpcoming, "Заявок ждут решения", "/admin/bookings?status=pending", true)}
        {stat(o.pendingOverdue, "Просрочено: время прошло, статус «Ожидает»", "/admin/bookings?status=pending", true)}
        {stat(o.todayActive, "Активных броней сегодня", "/admin/bookings")}
        {stat(o.next7Active, "Активных броней на 7 дней", "/admin/bookings")}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-3xl font-semibold">Очередь заявок</h2>
        {o.queue.length === 0 ? (
          <div className="max-w-3xl">
            <EmptyState icon="check" title="Новых заявок нет">Все заявки обработаны.</EmptyState>
          </div>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-3">
            {o.queue.map((q) => (
              <li key={q.id} className="vm-card flex flex-wrap items-center justify-between gap-4" style={{ padding: 20 }}>
                <div className="flex flex-col gap-2">
                  <p className="font-serif text-2xl font-semibold">
                    {q.dateLabel}, {q.time}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Chip icon="users" label="Гость">{q.guestName} · {q.partySize}</Chip>
                    <Chip icon="table" label="Стол">{q.tableName}</Chip>
                  </div>
                </div>
                <StatusActions bookingId={q.id} next={["confirmed", "cancelled"]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex max-w-3xl flex-col gap-4">
        <h2 className="text-3xl font-semibold">Что доступно ролям</h2>
        <div className="vm-card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="vm-table-head">
              <tr>
                <th className="px-4 py-3">Действие</th>
                <th className="px-4 py-3">Администратор</th>
                <th className="px-4 py-3">Суперадминистратор</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.permission} className="vm-row">
                  <td className="px-4 py-3">{c.label}</td>
                  {(["admin", "super_admin"] as const).map((role) => (
                    <td key={role} className="px-4 py-3">
                      <span className={`vm-badge ${can(role, c.permission) ? "bg-vm-green-tint text-vm-green" : "bg-vm-neutral-tint text-vm-muted"}`}>
                        {can(role, c.permission) ? "Да" : "Нет"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-vm-muted">
          Ваша роль: <strong>{ROLE_LABELS[user.role]}</strong>.
          {user.role !== "super_admin" && " Менять роли и смотреть историю ролей может только суперадминистратор."}
        </p>
      </section>
    </div>
  );
}
