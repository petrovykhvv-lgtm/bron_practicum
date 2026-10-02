import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { DemoAccounts } from "@/components/DemoAccounts";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="flex w-full max-w-md flex-col items-start gap-4">
        <AuthForm mode="login" />
        <p className="text-sm">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-vm-green underline decoration-vm-gold underline-offset-4">
            Зарегистрируйтесь
          </Link>
        </p>
      </div>
      <DemoAccounts />
    </div>
  );
}
