import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUsers } from "@/lib/auth/service";
import { can } from "@/lib/permissions";
import { UserRoles } from "./UserRoles";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // Серверная проверка: страница без права не отдаёт ни данных, ни интерфейса.
  if (!can(me.role, "user:list")) redirect("/account?denied=1");

  const users = await listUsers(prisma);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl font-bold">Пользователи</h1>
      <UserRoles
        me={{ id: me.id, role: me.role }}
        users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role }))}
      />
    </div>
  );
}
