import Link from "next/link";
import { StatusActions } from "@/components/admin/StatusActions";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getAdminOverview } from "@/lib/admin/service";
import { requireStaffPage } from "@/lib/admin/guard";
import { can, CAPABILITIES } from "@/lib/permissions";

export default async function AdminOverviewPage() {
  const user = await requireStaffPage("booking:view_all");
  const result = await getAdminOverview(prisma, { id: user.id, role: user.role }, new Date(), getRestaurantTz());
  if (!result.ok) return null;
  const o = result.data;

  const stat = (value: number, label: string, href: string, accent = false) => (
    <Link
      href={href}
      className="vm-card flex flex-col gap-1 hover:bg-vm-green-tint"
      style={accent && value > 0 ? { borderLeft: "4px solid var(--vm-gold)" } : undefined}
    >
      <span className="font-serif text-5xl font-bold text-vm-green">{value}</span>
      <span className="text-sm text-vm-muted">{label}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">Обзор</h1>

      <section aria-label="Показатели" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(o.pendingUpcoming, "Заявок ждут решения", "/admin/bookings?status=pending", true)}
        {stat(o.pendingOverdue, "Просрочено: время прошло, статус «Ожидает»", "/admin/bookings?status=pending", true)}
        {stat(o.todayActive, "Активных броней сегодня", "/admin/bookings")}
        {stat(o.next7Active, "Активных броней на 7 дней", "/admin/bookings")}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-3xl font-semibold">Очередь заявок</h2>
        {o.queue.length === 0 ? (
          <p className="text-vm-muted">Новых заявок нет.</p>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-3">
            {o.queue.map((q) => (
              <li key={q.id} className="vm-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-serif text-2xl font-semibold">
                    {q.dateLabel}, {q.time}
                  </p>
                  <p className="text-sm text-vm-muted">
                    {q.guestName} · гостей: {q.partySize} · {q.tableName}
                  </p>
                </div>
                <StatusActions bookingId={q.id} next={["confirmed", "cancelled"]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-3xl font-semibold">Что доступно ролям</h2>
        <div className="vm-card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-vm-green-tint">
              <tr>
                <th className="px-4 py-3 font-semibold">Действие</th>
                <th className="px-4 py-3 font-semibold">Администратор</th>
                <th className="px-4 py-3 font-semibold">Суперадминистратор</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.permission} className="border-t border-vm-line">
                  <td className="px-4 py-3">{c.label}</td>
                  {(["admin", "super_admin"] as const).map((role) => (
                    <td key={role} className="px-4 py-3">
                      <span className={can(role, c.permission) ? "font-semibold text-vm-green" : "text-vm-muted"}>
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
          Ваша роль: <strong>{user.role === "super_admin" ? "суперадминистратор" : "администратор"}</strong>.
          {user.role !== "super_admin" && " Менять роли и смотреть историю ролей может только суперадминистратор."}
        </p>
      </section>
    </div>
  );
}
