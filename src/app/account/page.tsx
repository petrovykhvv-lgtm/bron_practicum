import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const ROLE_LABELS = { user: "Гость", admin: "Администратор", super_admin: "Суперадминистратор" } as const;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { denied } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      {denied && (
        <p role="alert" className="max-w-md rounded-md bg-vm-danger-tint px-3 py-2 text-sm text-vm-danger">
          Недостаточно прав для этого раздела.
        </p>
      )}
      <section className="vm-card max-w-md">
        <h1 className="mb-4 text-4xl font-bold">Личный кабинет</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-vm-muted">Имя</dt>
          <dd>{user.name}</dd>
          <dt className="text-vm-muted">Email</dt>
          <dd>{user.email}</dd>
          <dt className="text-vm-muted">Роль</dt>
          <dd>
            <span className="vm-badge bg-vm-green-tint text-vm-green">{ROLE_LABELS[user.role]}</span>
          </dd>
        </dl>
      </section>
    </div>
  );
}
