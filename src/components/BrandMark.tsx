import { cn } from "@/lib/utils";

/** Знак «Лидер»: янтарная плашка с буквой. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md bg-signal text-sm font-bold leading-none text-[oklch(0.18_0.02_240)] shadow-sm shadow-signal/25",
        className,
      )}
    >
      Л
    </span>
  );
}
