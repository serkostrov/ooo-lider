import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const FALLBACK = "oklch(0.62 0.02 250)";

/**
 * Статус-бейдж: цвет из справочника.
 * Насыщенная заливка и крупный текст — читается на тёмной таблице.
 */
export function ToneBadge({
  color,
  children,
  className,
  truncate = true,
}: {
  color: string | null | undefined;
  children: ReactNode;
  className?: string | undefined;
  /** false — текст целиком (колонка с фикс. шириной). */
  truncate?: boolean | undefined;
}) {
  const c = color || FALLBACK;
  const style: CSSProperties = {
    backgroundColor: `color-mix(in oklab, ${c} 28%, var(--card))`,
    color: `color-mix(in oklab, ${c} 78%, white)`,
    boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${c} 55%, transparent)`,
  };
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold leading-none tracking-tight",
        className,
      )}
      style={style}
      title={typeof children === "string" ? children : undefined}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: c, boxShadow: `0 0 0 2px color-mix(in oklab, ${c} 35%, transparent)` }}
      />
      <span className={cn("min-w-0", truncate ? "truncate" : "whitespace-nowrap")}>{children}</span>
    </span>
  );
}
