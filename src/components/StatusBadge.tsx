import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "signal";

const tones: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-success-soft text-success ring-success/35",
  warning: "bg-warning-soft text-warning ring-warning/35",
  danger: "bg-danger-soft text-danger ring-danger/35",
  info: "bg-info-soft text-info ring-info/35",
  signal: "bg-signal/15 text-signal ring-signal/35",
};

const dot: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  signal: "bg-signal",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
  showDot = true,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-xl px-2.5 text-[13px] font-semibold leading-none ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {showDot ? (
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot[tone])} />
      ) : null}
      {children}
    </span>
  );
}
