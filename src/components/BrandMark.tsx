import { cn } from "@/lib/utils";

/** Знак «Лидер»: плашка с буквой. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md bg-primary font-[family-name:var(--font-display)] text-sm font-bold leading-none text-primary-foreground shadow-[0_0_0_1px_#ffffff1f_inset]",
        className,
      )}
    >
      Л
    </span>
  );
}
