import type { HTMLAttributes } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ручка перетаскивания для справочников. */
export function DragHandle({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { "aria-label"?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing touch-none",
        className,
      )}
      aria-label={props["aria-label"] ?? "Перетащить"}
      title="Перетащить"
      {...props}
    >
      <GripVertical className="size-4" />
    </button>
  );
}
