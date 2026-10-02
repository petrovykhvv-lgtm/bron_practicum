import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
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
  const now = new Date();
  const bookings = await listUserBookings(prisma, user.id, now, tz);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Мои брони</h1>
        <Link href="/book" className="vm-btn vm-btn-primary">
          Забронировать
        </Link>
      </div>
      {created && (
        <p role="status" className="max-w-2xl rounded-md bg-vm-green-tint px-3 py-2 text-sm text-vm-green">
          Заявка отправлена. Статус «Ожидает»: администратор подтвердит бронь, уведомление придёт в разделе «Уведомления».
        </p>
      )}
      {bookings.length === 0 ? (
        <p className="text-vm-muted">Броней пока нет. Выберите дату и время, чтобы забронировать стол.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {bookings.map((b) => (
            <li key={b.id} className="vm-card flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-serif text-2xl font-semibold">{formatDateTimeRu(new Date(b.startsAt), tz)}</p>
                <p className="text-sm text-vm-muted">
                  Гостей: {b.partySize} · {b.tableName}
                </p>
                {b.comment && <p className="text-sm">«{b.comment}»</p>}
                {b.canCancel && (
                  <p className="text-xs text-vm-muted">
                    Отменить можно до {formatDateTimeRu(new Date(b.cancelDeadline), tz)}
                  </p>
                )}
                {!b.canCancel && (b.status === "pending" || b.status === "confirmed") && (
                  <p className="text-xs text-vm-muted">Срок самостоятельной отмены прошёл, свяжитесь с рестораном.</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
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
