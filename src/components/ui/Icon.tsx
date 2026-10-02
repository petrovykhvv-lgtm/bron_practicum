import type { SVGProps } from "react";

// Небольшой набор линейных иконок в одном стиле (24×24, штрих 1.8). Только декор: aria-hidden.
const PATHS = {
  leaf: <><path d="M5 19c0-8.5 5-14 14-14 0 9-5.5 14-14 14z" /><path d="M5 19l8-8" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 13.2c2.6.3 4.5 2.4 4.5 5.1" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M8 3v4M16 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  table: <><ellipse cx="12" cy="9" rx="8" ry="3" /><path d="M12 12v8M8 20h8" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  bell: <><path d="M6 16v-5a6 6 0 1112 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 004 0" /></>,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  list: <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
