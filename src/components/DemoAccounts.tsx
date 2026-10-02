import { Icon } from "./ui/Icon";

// Демо-доступ для проверяющего. Значения берутся из тех же переменных, что и seed, поэтому не расходятся с базой.
// Отключается переменной SHOW_DEMO_ACCOUNTS="false" (для любого запуска не на локальной машине).
export function DemoAccounts() {
  if (process.env.SHOW_DEMO_ACCOUNTS === "false") return null;
  const superEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!superEmail || !superPassword || !demoPassword) return null;

  const accounts = [
    { role: "Суперадминистратор", emails: [superEmail], password: superPassword },
    { role: "Администратор", emails: ["admin@verdemarea.local"], password: demoPassword },
    { role: "Гости", emails: ["guest1@verdemarea.local", "guest2@verdemarea.local"], password: demoPassword },
  ];

  return (
    <aside
      aria-label="Демо-доступ для проверки"
      className="vm-glass vm-glass-strong ml-auto flex w-full max-w-sm flex-col gap-3 p-4 xl:fixed xl:right-8 xl:top-24 xl:z-20"
      style={{ border: "1.5px solid var(--vm-gold)", borderRadius: "var(--r-lg)" }}
    >
      <div className="flex items-center gap-3">
        <span className="vm-icon-disc">
          <Icon name="shield" size={18} />
        </span>
        <div>
          <p className="vm-eyebrow">Демо-доступ</p>
          <p className="text-xs text-vm-muted">Тестовые аккаунты для проверки. Вход: /login</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {accounts.map((a) => (
          <li key={a.role} className="flex flex-col gap-1 border-t border-[var(--vm-hairline)] pt-3 text-sm first:border-t-0 first:pt-0">
            <span className="font-semibold">{a.role}</span>
            {a.emails.map((email) => (
              <code key={email} className="break-all font-mono text-xs">{email}</code>
            ))}
            <span className="text-xs text-vm-muted">
              пароль: <code className="rounded bg-vm-gold-tint px-1.5 py-0.5 font-mono text-vm-ink">{a.password}</code>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
