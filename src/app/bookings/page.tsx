import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDateTimeRu } from "@/lib/booking/format";
import { listUserBookings } from "@/lib/booking/service";
import { CancelButton } from "./CancelButton";

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { created } = await searchParams;
  const tz = getRestaurantTz();
  const bookings = await listUserBookings(prisma, user.id, new Date(), tz);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Ваши визиты"
        title={<>Мои <em>брони</em></>}
        action={<Link href="/book" className="vm-btn vm-btn-primary">Забронировать</Link>}
      />
      {created && (
        <Notice kind="success" className="max-w-3xl">
          Заявка отправлена. Статус «Ожидает»: администратор подтвердит бронь, уведомление придёт в разделе «Уведомления».
        </Notice>
      )}
      {bookings.length === 0 ? (
        <div className="max-w-3xl">
          <EmptyState
            icon="calendar"
            title="Броней пока нет"
            action={<Link href="/book" className="vm-btn vm-btn-primary vm-btn-sm">Выбрать дату и время</Link>}
          >
            Забронируйте стол: выберите дату, время и число гостей.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-4">
          {bookings.map((b) => (
            <li key={b.id} className="vm-card flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-3">
                <p className="font-serif text-3xl font-semibold">{formatDateTimeRu(new Date(b.startsAt), tz)}</p>
                <div className="flex flex-wrap gap-2">
                  <Chip icon="users" label="Гостей">{b.partySize}</Chip>
                  <Chip icon="table" label="Стол">{b.tableName}</Chip>
                </div>
                {b.comment && <p className="text-sm">«{b.comment}»</p>}
                {b.canCancel && (
                  <p className="text-xs text-vm-muted">Отменить можно до {formatDateTimeRu(new Date(b.cancelDeadline), tz)}</p>
                )}
                {!b.canCancel && (b.status === "pending" || b.status === "confirmed") && (
                  <p className="text-xs text-vm-muted">Срок самостоятельной отмены прошёл, свяжитесь с рестораном.</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <StatusBadge status={b.status} />
                {b.canCancel && <CancelButton id={b.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
