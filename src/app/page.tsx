import Image from "next/image";
import Link from "next/link";
import { DemoAccounts } from "@/components/DemoAccounts";
import { Gallery } from "@/components/Gallery";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FIRST_SLOT_MINUTES, LAST_SLOT_MINUTES, MAX_PARTY_SIZE, OWNER_CANCEL_DEADLINE_HOURS, SLOT_STEP_MINUTES } from "@/lib/booking/rules";
import { listPhotos } from "@/lib/photos";

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "users", title: "Выберите гостей и время", text: "Показываем только свободные окна: прошедшего времени и занятых столов нет." },
  { icon: "table", title: "Стол назначим сами", text: "Подбираем стол по числу гостей. Статус «Ожидает» значит, что заявка принята." },
  { icon: "check", title: "Получите подтверждение", text: "Администратор подтверждает бронь, а уведомление придёт в личный кабинет." },
];

export default async function Home() {
  const user = await getCurrentUser();
  const photos = await listPhotos();
  const [heroPhoto, ...galleryPhotos] = photos;

  return (
    <div className="flex flex-col gap-12">
      <DemoAccounts />

      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="vm-glass vm-hero flex flex-col gap-6">
          <span className="vm-eyebrow">Ресторан у воды</span>
          <h1 className="vm-title" style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)" }}>
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
            <li><Chip icon="clock" label="Отмена">За {OWNER_CANCEL_DEADLINE_HOURS} часа до визита</Chip></li>
          </ul>
        </div>

        {/* Арка-визитка: фото ресторана (если есть в public/photos) или мягкая «морская» заливка */}
        <aside className="vm-arch mx-auto w-full max-w-sm" aria-label="Режим работы">
          <div className="vm-arch-art">
            {heroPhoto && <Image src={heroPhoto} alt="" fill priority sizes="(min-width: 1024px) 24rem, 90vw" className="object-cover" />}
          </div>
          <div className="vm-arch-card">
            <span className="vm-eyebrow">Режим работы</span>
            <p className="font-serif text-3xl font-semibold">Вторник — воскресенье</p>
            <p className="text-sm text-vm-muted">
              Посадка с {hhmm(FIRST_SLOT_MINUTES)} до {hhmm(LAST_SLOT_MINUTES)}, каждые {SLOT_STEP_MINUTES} минут. Столы на 2–{MAX_PARTY_SIZE} гостей. Понедельник — выходной.
            </p>
          </div>
        </aside>
      </section>

      <section aria-label="Как это работает" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="vm-eyebrow">Как это работает</span>
          <h2 className="text-4xl font-bold">
            Три шага до <em className="font-semibold text-vm-green">вашего стола</em>
          </h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="vm-card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="vm-icon-disc">
                  <Icon name={step.icon} />
                </span>
                <span className="font-serif text-3xl font-semibold text-vm-gold-ink">0{i + 1}</span>
              </div>
              <h3 className="font-serif text-2xl font-semibold">{step.title}</h3>
              <p className="text-sm text-vm-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Gallery photos={galleryPhotos} />
    </div>
  );
}
