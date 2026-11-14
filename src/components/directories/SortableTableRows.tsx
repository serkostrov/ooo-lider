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
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { REORDER_ACTIONS_W } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DragHandle } from "./DragHandle";
import { orderedIdsAfterDrag, useDirectoryDndSensors, verticalSortableStyle } from "./dnd";

/**
 * TableBody с DnD-строками. Каждый ребёнок — SortableTableRow с id.
 * onReorder(orderedIds) — новый порядок.
 */
export function SortableTableBody({
  ids,
  disabled,
  onReorder,
  children,
}: {
  ids: string[];
  disabled?: boolean;
  onReorder: (orderedIds: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useDirectoryDndSensors();

  if (disabled) {
    return <TableBody>{children}</TableBody>;
  }

  const onDragEnd = (event: DragEndEvent) => {
    const next = orderedIdsAfterDrag(ids, event);
    if (next) onReorder(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <TableBody>{children}</TableBody>
      </SortableContext>
    </DndContext>
  );
}

/** Строка таблицы с grip в последней ячейке (когда !disabled). */
export function SortableTableRow({
  id,
  disabled,
  className,
  onClick,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <TableRow className={className} onClick={onClick}>
        {children}
      </TableRow>
    );
  }

  return (
    <SortableTableRowInner
      id={id}
      {...(className ? { className } : {})}
      {...(onClick ? { onClick } : {})}
    >
      {children}
    </SortableTableRowInner>
  );
}

function SortableTableRowInner({
  id,
  className,
  onClick,
  children,
}: {
  id: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = verticalSortableStyle(transform, transition, {
    opacity: isDragging ? 0.85 : undefined,
  });

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(className, isDragging && "relative z-10 bg-card shadow-md")}
      onClick={onClick}
    >
      {children}
      <TableCell
        className={cn(REORDER_ACTIONS_W, "text-right")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end">
          <DragHandle {...attributes} {...listeners} />
        </div>
      </TableCell>
    </TableRow>
  );
}
