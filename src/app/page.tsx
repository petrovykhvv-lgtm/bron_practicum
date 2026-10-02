import Link from "next/link";
import { DemoAccounts } from "@/components/DemoAccounts";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OWNER_CANCEL_DEADLINE_HOURS } from "@/lib/booking/rules";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-col gap-6">
      <DemoAccounts />
      <section className="vm-glass vm-hero flex max-w-4xl flex-col gap-6">
        <span className="vm-eyebrow">Ресторан у воды</span>
        <h1 className="vm-title" style={{ fontSize: "clamp(2.75rem, 7vw, 4.75rem)" }}>
          Verde Marea
          <br />
          <em>ваш стол ждёт вас</em>
        </h1>
        <p className="vm-lead">
          Средиземноморская кухня и неспешный вечер у воды. Выберите дату, время и число гостей — подходящий стол мы назначим сами.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {user ? (
            <>
              <Link href="/book" className="vm-btn vm-btn-primary">
                Забронировать стол <Icon name="arrow" size={18} />
              </Link>
              <Link href="/bookings" className="vm-btn vm-btn-secondary">Мои брони</Link>
            </>
          ) : (
            <>
              <Link href="/register" className="vm-btn vm-btn-primary">
                Создать аккаунт <Icon name="arrow" size={18} />
              </Link>
              <Link href="/login" className="vm-btn vm-btn-secondary">Войти</Link>
            </>
          )}
        </div>
        <hr className="border-t border-[var(--vm-hairline)]" />
        <ul className="flex flex-wrap gap-3">
          <li><Chip icon="calendar" label="Выбор">Только свободное время</Chip></li>
          <li><Chip icon="table" label="Стол">Подбирается автоматически</Chip></li>
          <li><Chip icon="check" label="Бронь">Подтверждает администратор</Chip></li>
          <li><Chip icon="clock" label="Отмена">За {OWNER_CANCEL_DEADLINE_HOURS} часа до визита</Chip></li>
        </ul>
      </section>
    </div>
  );
}
