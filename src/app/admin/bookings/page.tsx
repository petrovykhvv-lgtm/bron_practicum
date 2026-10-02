import Link from "next/link";
import { BookingHistory } from "@/components/admin/BookingHistory";
import { StatusActions } from "@/components/admin/StatusActions";
import { StatusBadge } from "@/components/StatusBadge";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { bookingFilterSchema } from "@/lib/admin/schemas";
import { listAdminBookings } from "@/lib/admin/service";
import { requireStaffPage } from "@/lib/admin/guard";
import { localDateKey } from "@/lib/booking/format";
import { STATUS_LABELS } from "@/lib/labels";

const STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"] as const;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const COLS = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.55fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.9fr)]";
const GRID = `md:grid ${COLS} md:items-center md:gap-4`;

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const user = await requireStaffPage("booking:view_all");
  const raw = await searchParams;
  const parsed = bookingFilterSchema.safeParse({ status: first(raw.status), from: first(raw.from), to: first(raw.to) });
  const filter = parsed.success ? parsed.data : {};
  const tz = getRestaurantTz();

  const result = await listAdminBookings(prisma, { id: user.id, role: user.role }, filter, tz);
  if (!result.ok) return null;
  const { bookings, truncated } = result.data;

  const now = new Date();
  const todayKey = localDateKey(now, tz);
  const weekKey = localDateKey(new Date(now.getTime() + 7 * 86400000), tz);
  const presets = [
    { label: "Все", href: "/admin/bookings" },
    { label: "Ожидают решения", href: "/admin/bookings?status=pending" },
    { label: "Сегодня", href: `/admin/bookings?from=${todayKey}&to=${todayKey}` },
    { label: "Ближайшие 7 дней", href: `/admin/bookings?from=${todayKey}&to=${weekKey}` },
    { label: "Не пришли", href: "/admin/bookings?status=no_show" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl font-bold">Брони</h1>

      <nav aria-label="Быстрые фильтры" className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link key={p.label} href={p.href} className="vm-btn vm-btn-secondary" style={{ minHeight: 36, padding: "0 14px", fontSize: 14 }}>
            {p.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="vm-card flex flex-wrap items-end gap-4">
        <div>
          <label className="vm-label" htmlFor="status">Статус</label>
          <select id="status" name="status" defaultValue={filter.status ?? ""} className="vm-input" style={{ minWidth: 180 }}>
            <option value="">Все</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="vm-label" htmlFor="from">Дата с</label>
          <input id="from" name="from" type="date" defaultValue={filter.from ?? ""} className="vm-input" />
        </div>
        <div>
          <label className="vm-label" htmlFor="to">Дата по</label>
          <input id="to" name="to" type="date" defaultValue={filter.to ?? ""} className="vm-input" />
        </div>
        <button type="submit" className="vm-btn vm-btn-primary">Показать</button>
        <Link href="/admin/bookings" className="text-sm font-semibold text-vm-green hover:underline">Сбросить</Link>
      </form>

      {!parsed.success && (
        <p role="alert" className="rounded-md bg-vm-danger-tint px-3 py-2 text-sm text-vm-danger">
          Фильтры заданы неверно ({parsed.error.issues[0]?.message}), показаны все брони.
        </p>
      )}

      <p className="text-sm text-vm-muted">
        Найдено: {bookings.length}
        {truncated && " (показаны первые 200, уточните фильтры)"}
      </p>

      {bookings.length === 0 ? (
        <p className="text-vm-muted">По выбранным фильтрам броней нет.</p>
      ) : (
        <div className="vm-card p-0">
          <div className={`hidden bg-vm-green-tint px-4 py-3 text-sm font-semibold md:grid ${COLS} md:gap-4`}>
            <span>Дата и время</span><span>Гость</span><span>Гостей</span><span>Стол</span><span>Статус</span><span>Действия</span>
          </div>
          <ul>
            {bookings.map((b) => (
              <li key={b.id} className={`flex flex-col gap-2 border-t border-vm-line px-4 py-3 first:border-t-0 hover:bg-vm-green-tint md:border-t ${GRID}`}>
                <div>
                  <p className="font-semibold">{b.dateLabel}</p>
                  <p className="text-sm text-vm-muted">{b.time}</p>
                </div>
                <div className="text-sm">
                  <p>{b.guest.name}</p>
                  <p className="text-vm-muted">{b.guest.email}</p>
                  {b.comment && <p className="mt-1">«{b.comment}»</p>}
                </div>
                <p className="text-sm"><span className="md:hidden text-vm-muted">Гостей: </span>{b.partySize}</p>
                <p className="text-sm"><span className="md:hidden text-vm-muted">Стол: </span>{b.table.name} <span className="text-vm-muted">({b.table.capacity})</span></p>
                <div><StatusBadge status={b.status} /></div>
                <div className="flex flex-col gap-2">
                  <StatusActions bookingId={b.id} next={b.nextStatuses} />
                  <BookingHistory bookingId={b.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
