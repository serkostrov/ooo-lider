import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SurfaceVariant = "default" | "elevated" | "muted" | "danger" | "warning" | "success" | "info";

const variants: Record<SurfaceVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  elevated: "border-border bg-elevated text-elevated-foreground shadow-sm shadow-black/15",
  muted: "border-border/80 bg-muted/50 text-foreground",
  danger: "border-danger/30 bg-danger-soft text-foreground",
  warning: "border-warning/30 bg-warning-soft text-foreground",
  success: "border-success/30 bg-success-soft text-foreground",
  info: "border-info/30 bg-info-soft text-foreground",
};

export function Surface({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }) {
  return <div className={cn("rounded-xl border p-4", variants[variant], className)} {...props} />;
}
