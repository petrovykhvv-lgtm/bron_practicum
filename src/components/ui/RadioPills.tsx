"use client";

import { useRef } from "react";

export interface PillOption {
  value: string;
  label: string;
}

// Группа капсул-«радио» с управлением с клавиатуры: Tab заходит в группу один раз,
// стрелки переключают выбор, Home и End прыгают к краям (как в стандартных radiogroup).
export function RadioPills({
  options,
  value,
  onChange,
  label,
  size = "sm",
}: {
  options: PillOption[];
  value: string | null;
  onChange: (value: string) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(options.findIndex((o) => o.value === value), 0);

  function move(to: number) {
    const next = (to + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        const keys: Record<string, number> = {
          ArrowRight: activeIndex + 1,
          ArrowDown: activeIndex + 1,
          ArrowLeft: activeIndex - 1,
          ArrowUp: activeIndex - 1,
          Home: 0,
          End: options.length - 1,
        };
        if (event.key in keys) {
          event.preventDefault();
          move(keys[event.key]);
        }
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`vm-btn ${size === "sm" ? "vm-btn-sm" : ""} ${selected ? "vm-btn-primary" : "vm-btn-secondary"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
