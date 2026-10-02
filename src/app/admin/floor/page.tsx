import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/admin/guard";
import { getFloorPlan } from "@/lib/admin/service";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FloorPlanPage({ searchParams }: PageProps<"/admin/floor">) {
  const user = await requireStaffPage("booking:view_all");
  const raw = await searchParams;
  const result = await getFloorPlan(prisma, { id: user.id, role: user.role }, first(raw.date), new Date(), getRestaurantTz());
  if (!result.ok) return null;
  const plan = result.data;
  const nav = "vm-btn vm-btn-secondary vm-btn-sm";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Администрирование"
        title={<>План <em>зала</em></>}
        description="Столы по строкам, время по столбцам: кто где сидит и где ещё свободно. Отменённые брони не показываются."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/floor?date=${plan.prev}`} className={nav} aria-label="Предыдущий день">← День</Link>
        <Link href="/admin/floor" className={nav}>Сегодня</Link>
        <Link href={`/admin/floor?date=${plan.next}`} className={nav} aria-label="Следующий день">День →</Link>
        <form method="get" className="flex items-center gap-2">
          <label className="sr-only" htmlFor="floor-date">Дата</label>
          <input id="floor-date" name="date" type="date" defaultValue={plan.date} className="vm-input" style={{ minHeight: 36, width: "auto" }} />
          <button type="submit" className="vm-btn vm-btn-primary vm-btn-sm">Показать</button>
        </form>
      </div>

      <h2 className="text-3xl font-semibold">{plan.dateLabel.charAt(0).toUpperCase() + plan.dateLabel.slice(1)}</h2>

      {!plan.isOpenDay ? (
        <div className="max-w-3xl">
          <EmptyState icon="calendar" title="Выходной" action={<Link href="/admin/floor" className="vm-btn vm-btn-secondary vm-btn-sm">Вернуться к сегодняшнему дню</Link>}>
            По понедельникам ресторан закрыт, окон записи нет.
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="text-sm text-vm-muted">
            Броней: {plan.totals.bookings} · гостей: {plan.totals.guests} · свободных ячеек: {plan.totals.freeCells}
          </p>
          <div className="vm-card overflow-x-auto p-0">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead className="vm-table-head">
                <tr>
                  <th scope="col" className="sticky left-0 bg-[rgba(238,243,239,1)] px-4 py-3">Стол</th>
                  {plan.columns.map((c) => (
                    <th key={c.startsAt} scope="col" className="px-3 py-3">
                      {c.time}
                      {c.closed && <span className="vm-badge ml-2 bg-vm-neutral-tint text-vm-muted" title={c.reason ?? "Окно закрыто"}>закрыто</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((row) => (
                  <tr key={row.table.id} className="vm-row align-top">
                    <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left font-semibold">
                      {row.table.name}
                      <span className="block text-xs font-normal text-vm-muted">
                        {row.table.capacity} мест{row.table.isActive ? "" : " · не используется"}
                      </span>
                    </th>
                    {row.cells.map((cell, i) => {
                      const column = plan.columns[i];
                      return (
                        <td key={column.startsAt} className="px-2 py-2" style={column.closed ? { background: "var(--vm-neutral-tint)" } : undefined}>
                          {cell ? (
                            <Link
                              href={`/admin/bookings?from=${plan.date}&to=${plan.date}`}
                              className="flex min-w-[8rem] flex-col gap-1 rounded-[var(--r-md)] border border-[var(--vm-hairline)] bg-white p-2 hover:shadow-[var(--shadow-lift)]"
                              title={cell.comment ?? undefined}
                            >
                              <span className="font-semibold">{cell.guestName}</span>
                              <span className="text-xs text-vm-muted">гостей: {cell.partySize}</span>
                              <StatusBadge status={cell.status} />
                            </Link>
                          ) : (
                            <span className="text-xs text-vm-muted">{column.closed ? "закрыто" : row.table.isActive ? "свободно" : "—"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
