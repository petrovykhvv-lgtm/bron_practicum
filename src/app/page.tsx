import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <section className="flex max-w-xl flex-col gap-4 py-8">
      <h1 className="text-6xl font-bold text-vm-green">Verde Marea</h1>
      <p className="text-lg">Ресторан средиземноморской кухни у воды. Бронируйте стол онлайн.</p>
      {user ? (
        <p>
          Вы вошли как <strong>{user.name}</strong>.{" "}
          <Link href="/account" className="font-semibold text-vm-green hover:underline">
            Личный кабинет
          </Link>
        </p>
      ) : (
        <div className="flex gap-3">
          <Link href="/login" className="vm-btn vm-btn-primary">
            Войти
          </Link>
          <Link href="/register" className="vm-btn vm-btn-secondary">
            Регистрация
          </Link>
        </div>
      )}
    </section>
  );
}
