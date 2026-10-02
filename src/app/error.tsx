"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

// В этой версии Next.js функция повтора называется retry.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl">
      <EmptyState
        icon="alert"
        title="Что-то пошло не так"
        action={
          <button type="button" className="vm-btn vm-btn-primary vm-btn-sm" onClick={() => retry()}>
            Попробовать снова
          </button>
        }
      >
        Мы не смогли показать эту страницу. Попробуйте ещё раз, а если ошибка повторяется, обратитесь в ресторан.
      </EmptyState>
    </div>
  );
}
