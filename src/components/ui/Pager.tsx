import Link from "next/link";

// Постраничная навигация ссылками: работает без JS, сохраняет остальные параметры адреса.
export function Pager({ basePath, params, page, pageCount, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageCount: number; total: number }) {
  const href = (p: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (p > 1) query.set("page", String(p));
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  if (pageCount <= 1) return <p className="text-sm text-vm-muted">Всего записей: {total}</p>;
  return (
    <nav aria-label="Страницы" className="flex flex-wrap items-center gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className="vm-btn vm-btn-secondary vm-btn-sm">← Назад</Link>
      ) : (
        <span className="vm-btn vm-btn-secondary vm-btn-sm" aria-disabled="true" style={{ opacity: 0.5 }}>← Назад</span>
      )}
      <span className="text-sm text-vm-muted">
        Страница {page} из {pageCount} · записей: {total}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="vm-btn vm-btn-secondary vm-btn-sm">Вперёд →</Link>
      ) : (
        <span className="vm-btn vm-btn-secondary vm-btn-sm" aria-disabled="true" style={{ opacity: 0.5 }}>Вперёд →</span>
      )}
    </nav>
  );
}
