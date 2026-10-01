import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <div className="flex flex-col items-start gap-4">
      <AuthForm mode="register" />
      <p className="text-sm">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-semibold text-vm-green hover:underline">
          Войдите
        </Link>
      </p>
    </div>
  );
}
