import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panelClass, REORDER_ACTIONS_W, TH_H } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * Компактный список с порядком: ↑↓ справа.
 * onMove получает новый порядок id.
 * variant=list — один блок со строками; cards — отдельные карточки (для сложных строк).
 *
 * Шапка и строки: [контент flex-1][действия w-16].
 * Клик по строке — через onRowClick (попадает во всю площадь ряда, кроме ↑↓).
 */
export function Reorderable<T extends { id: string }>({
  items,
  disabled,
  onMove,
  onRowClick,
  render,
  variant = "list",
  header,
}: {
  items: T[];
  disabled?: boolean;
  onMove: (orderedIds: string[]) => void;
  /** Клик по строке (кроме кнопок ↑↓). */
  onRowClick?: (item: T) => void;
  render: (item: T, index: number) => ReactNode;
  variant?: "list" | "cards";
  /** Колонки шапки list-варианта (без слота под ↑↓). */
  header?: ReactNode;
}) {
  const cards = variant === "cards";
  const showActions = !disabled;

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    onMove(ids);
  };

  return (
    <div className={cn(cards ? "space-y-2" : panelClass)}>
      {!cards && header ? (
        <div className={cn("flex items-stretch border-b border-border bg-muted/40", TH_H)}>
          <div className="flex min-w-0 flex-1 items-center gap-3 px-5">{header}</div>
          {showActions && <div className={cn(REORDER_ACTIONS_W, "shrink-0 pr-3")} aria-hidden />}
        </div>
      ) : null}
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "flex items-stretch transition-colors",
            cards
              ? "items-start gap-3 rounded-md border border-border bg-card/60 px-5 py-2.5"
              : cn("border-b border-border/60 last:border-b-0", onRowClick && "hover:bg-muted/40"),
          )}
        >
          {cards ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">{render(item, index)}</div>
          ) : onRowClick ? (
            <button
              type="button"
              onClick={() => onRowClick(item)}
              className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 px-5 py-2.5 text-left outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              {render(item, index)}
            </button>
          ) : (
            <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-5 py-2.5">
              {render(item, index)}
            </div>
          )}
          {showActions && (
            <div
              className={cn(
                "flex shrink-0 items-center self-center",
                REORDER_ACTIONS_W,
                cards ? "mt-0.5 flex-col" : "pr-3",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label="Выше"
                title="Выше"
                className="size-8 text-muted-foreground"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === items.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label="Ниже"
                title="Ниже"
                className="size-8 text-muted-foreground"
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
