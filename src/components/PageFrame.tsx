import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Список: шапка/фильтры сверху (не скроллятся), контент (таблица) занимает
 * оставшуюся высоту экрана и скроллится внутри.
 */
export function PageFrame({
  header,
  children,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="shrink-0">{header}</div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
