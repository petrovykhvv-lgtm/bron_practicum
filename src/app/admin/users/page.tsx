import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { listUsers } from "@/lib/auth/service";
import { requireStaffPage } from "@/lib/admin/guard";
import { can } from "@/lib/permissions";
import { UserRoles } from "./UserRoles";

export default async function AdminUsersPage() {
  // Серверная проверка: страница без права не отдаёт ни данных, ни интерфейса.
  const me = await requireStaffPage("user:list");

  const users = await listUsers(prisma);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Администрирование" title={<>Все <em>пользователи</em></>} />
      {!can(me.role, "user:change_role") && (
        <Notice kind="info" className="max-w-3xl">
          Список доступен для просмотра. Менять роли пользователей может только суперадминистратор.
        </Notice>
      )}
      <UserRoles
        me={{ id: me.id, role: me.role }}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role }))}
      />
    </div>
  );
}
