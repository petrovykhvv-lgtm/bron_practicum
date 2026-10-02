import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDateTimeRu } from "@/lib/booking/format";
import { listNotifications } from "@/lib/booking/service";
import { MarkReadButton } from "./MarkReadButton";

const ICONS: Record<string, IconName> = {
  booking_created: "calendar",
  booking_confirmed: "check",
  booking_cancelled: "alert",
  booking_completed: "check",
  booking_no_show: "alert",
  role_changed: "shield",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tz = getRestaurantTz();
  const notifications = await listNotifications(prisma, user.id);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={unread > 0 ? `Новых: ${unread}` : "Всё прочитано"}
        title={<>Уведомления</>}
        action={unread > 0 ? <MarkReadButton /> : undefined}
      />
      {notifications.length === 0 ? (
        <div className="max-w-3xl">
          <EmptyState icon="bell" title="Уведомлений пока нет">
            Здесь появятся сообщения о ваших бронях: заявка принята, бронь подтверждена или отменена.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="vm-card flex gap-4"
              style={{ padding: 16, background: n.read ? "var(--vm-glass)" : "var(--vm-gold-tint)" }}
            >
              <span className={`vm-icon-disc ${n.read ? "vm-icon-disc-green" : ""}`}>
                <Icon name={ICONS[n.type] ?? "bell"} size={18} />
              </span>
              <div>
                <p className="font-semibold">
                  {n.title}
                  {!n.read && <span className="sr-only"> (новое)</span>}
                </p>
                <p className="text-sm">{n.body}</p>
                <p className="mt-1 text-xs text-vm-muted">{formatDateTimeRu(new Date(n.createdAt), tz)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
