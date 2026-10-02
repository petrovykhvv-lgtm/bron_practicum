import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { BookingForm } from "./BookingForm";

export default async function BookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "booking:create")) redirect("/account?denied=1");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl font-bold">Забронировать стол</h1>
      <BookingForm />
    </div>
  );
}
