import type { ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { panelClass, REORDER_ACTIONS_W, TH_H } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DragHandle } from "../DragHandle";
import { orderedIdsAfterDrag, useDirectoryDndSensors, verticalSortableStyle } from "../dnd";

/**
 * Компактный список с порядком: grip справа (DnD).
 * onMove получает новый порядок id.
 * variant=list — один блок со строками; cards — отдельные карточки.
 *
 * Шапка и строки: [контент flex-1][действия w-16].
 * Клик по строке — через onRowClick (кроме ручки).
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
  onRowClick?: (item: T) => void;
  render: (item: T, index: number) => ReactNode;
  variant?: "list" | "cards";
  header?: ReactNode;
}) {
  const cards = variant === "cards";
  const showActions = !disabled;
  const sensors = useDirectoryDndSensors();
  const ids = items.map((i) => i.id);

  const onDragEnd = (event: DragEndEvent) => {
    const next = orderedIdsAfterDrag(ids, event);
    if (next) onMove(next);
  };

  const body = (
    <>
      {!cards && header ? (
        <div className={cn("flex items-stretch border-b border-border bg-muted/40", TH_H)}>
          <div className="flex min-w-0 flex-1 items-center gap-3 px-5">{header}</div>
          {showActions && <div className={cn(REORDER_ACTIONS_W, "shrink-0 pr-3")} aria-hidden />}
        </div>
      ) : null}
      {items.map((item, index) =>
        showActions ? (
          <SortableRow
            key={item.id}
            id={item.id}
            cards={cards}
            {...(onRowClick ? { onRowClick: () => onRowClick(item) } : {})}
          >
            {render(item, index)}
          </SortableRow>
        ) : (
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
          </div>
        ),
      )}
    </>
  );

  if (!showActions) {
    return <div className={cn(cards ? "space-y-2" : panelClass)}>{body}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={cn(cards ? "space-y-2" : panelClass)}>{body}</div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  cards,
  onRowClick,
  children,
}: {
  id: string;
  cards: boolean;
  onRowClick?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = verticalSortableStyle(transform, transition, {
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? "relative" : undefined,
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-stretch transition-colors",
        cards
          ? "items-start gap-3 rounded-md border border-border bg-card/60 px-5 py-2.5"
          : cn("border-b border-border/60 last:border-b-0 bg-card", onRowClick && "hover:bg-muted/40"),
        isDragging && "shadow-md ring-1 ring-border",
      )}
    >
      {cards ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      ) : onRowClick ? (
        <button
          type="button"
          onClick={onRowClick}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 px-5 py-2.5 text-left outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        >
          {children}
        </button>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-5 py-2.5">{children}</div>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center justify-end self-center",
          REORDER_ACTIONS_W,
          cards ? "mt-0.5" : "pr-3",
        )}
      >
        <DragHandle {...attributes} {...listeners} />
      </div>
    </div>
  );
}
