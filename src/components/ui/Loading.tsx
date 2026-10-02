// Загрузка: компактный спиннер с подписью для коротких запросов (кнопки показывают свой спиннер).
// Скелетоны (.vm-skeleton) доступны в стилях, но общего loading.tsx нет: он превращает серверные редиректы
// защищённых страниц в ответ 200 с meta refresh вместо настоящего 307.
export function InlineLoading({ text = "Загружаем…" }: { text?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-vm-muted">
      <span className="vm-spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
