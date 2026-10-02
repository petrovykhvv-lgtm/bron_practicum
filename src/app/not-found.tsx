import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="max-w-xl">
      <EmptyState icon="info" title="Такой страницы нет" action={<Link href="/" className="vm-btn vm-btn-primary vm-btn-sm">На главную</Link>}>
        Возможно, ссылка устарела или адрес набран с ошибкой.
      </EmptyState>
    </div>
  );
}
