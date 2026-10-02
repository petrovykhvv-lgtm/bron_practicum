import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";
import { BookingForm } from "./BookingForm";

export default async function BookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "booking:create")) redirect("/account?denied=1");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Бронирование"
        title={<>Забронировать <em>стол</em></>}
        description="Показаны только свободные окна. Подходящий стол мы назначим автоматически."
      />
      <BookingForm />
    </div>
  );
}
