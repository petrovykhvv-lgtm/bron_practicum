import { SlotsManager } from "@/components/admin/SlotsManager";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getSlotSchedule } from "@/lib/admin/service";
import { requireStaffPage } from "@/lib/admin/guard";

export default async function AdminSlotsPage() {
  const user = await requireStaffPage("slot:manage");
  const result = await getSlotSchedule(prisma, { id: user.id, role: user.role }, new Date(), getRestaurantTz());
  if (!result.ok) return null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl font-bold">Окна записи</h1>
      <p className="max-w-3xl text-sm text-vm-muted">
        Окна строятся по правилам: 14 дней вперёд, со вторника по воскресенье, каждые 90 минут с 12:00 до 21:00. Здесь можно
        закрыть окно для новых броней (банкет, санитарный день) или открыть его снова. Уже созданные брони при закрытии не отменяются.
      </p>
      <SlotsManager slots={result.data} />
    </div>
  );
}
