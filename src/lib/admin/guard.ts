import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can, type Permission } from "@/lib/permissions";

// Серверная защита страниц админки. Каждая страница вызывает её сама: layout при навигации
// не перерисовывается, поэтому защита только в layout была бы дырой.
export async function requireStaffPage(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, permission)) redirect("/account?denied=1");
  return user;
}
