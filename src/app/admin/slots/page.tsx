import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        eyebrow="Администрирование"
        title={<>Окна <em>записи</em></>}
        description="Окна строятся по правилам: 14 дней вперёд, со вторника по воскресенье, каждые 90 минут с 12:00 до 21:00. Закрытое окно не принимает новые брони (банкет, санитарный день); уже созданные брони не отменяются."
      />
      <SlotsManager slots={result.data} />
    </div>
  );
}
