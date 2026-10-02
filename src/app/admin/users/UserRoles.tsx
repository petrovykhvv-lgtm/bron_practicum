"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/generated/prisma/client";
import { Notice } from "@/components/ui/Notice";
import { can, checkRoleChange } from "@/lib/permissions";

interface Row {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const ROLE_LABELS: Record<Role, string> = { user: "Гость", admin: "Администратор", super_admin: "Суперадминистратор" };

// Те же функции can/checkRoleChange, что и на сервере: клиент лишь скрывает недоступное,
// решение всё равно принимает сервер.
export function UserRoles({ me, users }: { me: { id: string; role: Role }; users: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canChange = can(me.role, "user:change_role");

  async function setRole(id: string, role: Role) {
    setBusyId(id);
    setError(null);
    const response = await fetch(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Не удалось изменить роль");
    }
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Notice kind="error">{error}</Notice>}
      <div className="vm-card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="vm-table-head">
            <tr>
              <th className="px-4 py-3 font-semibold">Имя</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Роль</th>
              {canChange && <th className="px-4 py-3 font-semibold">Действие</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const target: Role | null = u.role === "user" ? "admin" : u.role === "admin" ? "user" : null;
              const allowed = target !== null && checkRoleChange({ actorRole: me.role, targetRole: u.role, newRole: target }).ok;
              return (
                <tr key={u.id} className="vm-row">
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3"><span className="vm-badge bg-vm-green-tint text-vm-green">{ROLE_LABELS[u.role]}</span></td>
                  {canChange && (
                    <td className="px-4 py-3">
                      {allowed && target ? (
                        <button
                          type="button"
                          className="vm-btn vm-btn-secondary vm-btn-sm"
                          disabled={busyId === u.id}
                          onClick={() => setRole(u.id, target)}
                        >
                          {target === "admin" ? "Сделать администратором" : "Сделать гостем"}
                        </button>
                      ) : (
                        <span className="text-vm-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
