import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SurfaceVariant = "default" | "elevated" | "muted" | "danger" | "warning" | "success" | "info";

const variants: Record<SurfaceVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  elevated: "border-border bg-elevated text-elevated-foreground",
  muted: "border-border/80 bg-muted/50 text-foreground",
  danger: "border-danger/35 bg-danger-soft text-foreground",
  warning: "border-warning/35 bg-warning-soft text-foreground",
  success: "border-success/35 bg-success-soft text-foreground",
  info: "border-info/35 bg-info-soft text-foreground",
};

export function Surface({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: SurfaceVariant }) {
  return <div className={cn("rounded-md border p-4", variants[variant], className)} {...props} />;
}
