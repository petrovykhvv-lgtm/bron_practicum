// Загрузка: скелетоны на месте будущих карточек и компактный спиннер для кнопок и коротких запросов.
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Загрузка" className="flex flex-col gap-3">
      <div className="vm-skeleton h-10 w-64" />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="vm-skeleton h-24 max-w-3xl" />
      ))}
    </div>
  );
}

export function InlineLoading({ text = "Загружаем…" }: { text?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-vm-muted">
      <span className="vm-spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
