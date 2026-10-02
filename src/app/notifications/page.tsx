import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDateTimeRu } from "@/lib/booking/format";
import { listNotifications } from "@/lib/booking/service";
import { MarkReadButton } from "./MarkReadButton";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tz = getRestaurantTz();
  const notifications = await listNotifications(prisma, user.id);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Уведомления</h1>
        {unread > 0 && <MarkReadButton />}
      </div>
      {notifications.length === 0 ? (
        <p className="text-vm-muted">Уведомлений пока нет.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="flex gap-3 rounded-md border border-vm-line px-4 py-3"
              style={{ background: n.read ? "var(--vm-surface)" : "var(--vm-gold-tint)" }}
            >
              <span
                aria-hidden
                className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: n.read ? "transparent" : "var(--vm-gold)" }}
              />
              <div>
                <p className="text-sm font-semibold">
                  {n.title}
                  {!n.read && <span className="sr-only"> (новое)</span>}
                </p>
                <p className="text-sm">{n.body}</p>
                <p className="text-xs text-vm-muted">{formatDateTimeRu(new Date(n.createdAt), tz)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
