import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { getRestaurantTz } from "@/lib/config";
import { prisma } from "@/lib/db";
import { auditQuerySchema } from "@/lib/admin/schemas";
import { listAuditPage } from "@/lib/admin/service";
import { Pager } from "@/components/ui/Pager";
import { requireStaffPage } from "@/lib/admin/guard";
import { ROLE_LABELS } from "@/lib/labels";
import { AUDIT_ENTITY_TYPES, can } from "@/lib/permissions";

const TYPE_LABELS: Record<string, string> = { Booking: "Брони", Slot: "Окна записи", User: "Роли и регистрации" };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminHistoryPage({ searchParams }: PageProps<"/admin/history">) {
  const user = await requireStaffPage("audit:view_bookings");
  const raw = await searchParams;
  const parsed = auditQuerySchema.safeParse({ entityType: first(raw.type), entityId: undefined, limit: undefined, page: first(raw.page) });
  const filter = parsed.success ? parsed.data : {};

  const result = await listAuditPage(prisma, { id: user.id, role: user.role }, filter, getRestaurantTz());
  if (!result.ok) return null;
  const types = AUDIT_ENTITY_TYPES[user.role];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Администрирование" title={<>История <em>изменений</em></>} description="Кто, что и когда сделал: брони, окна записи и роли." />
      <nav aria-label="Тип записей" className="flex flex-wrap gap-2">
        <Link href="/admin/history" className="vm-btn vm-btn-secondary vm-btn-sm">Все</Link>
        {types.map((t) => (
          <Link key={t} href={`/admin/history?type=${t}`} className="vm-btn vm-btn-secondary vm-btn-sm">
            {TYPE_LABELS[t]}
          </Link>
        ))}
      </nav>
      {!can(user.role, "audit:view_all") && (
        <Notice kind="info" className="max-w-3xl">
          Изменения ролей и регистрации видит только суперадминистратор. Вам доступна история броней и окон записи.
        </Notice>
      )}
      {result.data.entries.length === 0 ? (
        <div className="max-w-3xl"><EmptyState icon="list" title="Записей нет">В выбранном разделе пока ничего не происходило.</EmptyState></div>
      ) : (
        <ol className="flex max-w-4xl flex-col gap-2">
          {result.data.entries.map((e) => (
            <li key={e.id} className="vm-card flex flex-col gap-1" style={{ padding: 16 }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{e.label}</span>
                <span className="text-xs text-vm-muted">{e.createdLabel}</span>
              </div>
              {e.detail && <p className="text-sm">{e.detail}</p>}
              <p className="text-xs text-vm-muted">
                Кто: {e.actor ? `${e.actor.name} (${ROLE_LABELS[e.actor.role]})` : "система"}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Pager basePath="/admin/history" params={{ type: filter.entityType }} page={result.data.page} pageCount={result.data.pageCount} total={result.data.total} />
    </div>
  );
}
