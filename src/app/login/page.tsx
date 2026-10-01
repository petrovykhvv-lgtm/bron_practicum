import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <div className="flex flex-col items-start gap-4">
      <AuthForm mode="login" />
      <p className="text-sm">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-semibold text-vm-green hover:underline">
          Зарегистрируйтесь
        </Link>
      </p>
    </div>
  );
}
