import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "signal";

const tones: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-success-soft text-success ring-success/40",
  warning: "bg-warning-soft text-warning ring-warning/40",
  danger: "bg-danger-soft text-danger ring-danger/40",
  info: "bg-info-soft text-info ring-info/40",
  signal: "bg-signal/18 text-signal ring-signal/45",
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
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-semibold leading-none ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {showDot ? (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot[tone])} />
      ) : null}
      {children}
    </span>
  );
}
