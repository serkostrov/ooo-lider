import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { panelClass, REORDER_ACTIONS_W } from "@/lib/ui";
import { SortableTableBody } from "./SortableTableRows";

/** Общая оболочка справочников статусов — вид 1:1. */
export function StatusDirectoryShell({
  title,
  hint,
  onAdd,
  headerActions,
  showActions,
  sortable,
  children,
}: {
  title: string;
  hint: string;
  onAdd?: () => void;
  headerActions?: ReactNode;
  showActions?: boolean;
  /** DnD порядок строк (id = code). */
  sortable?: { ids: string[]; onReorder: (orderedIds: string[]) => void };
  children: ReactNode;
}) {
  const body =
    sortable && showActions ? (
      <SortableTableBody ids={sortable.ids} onReorder={sortable.onReorder}>
        {children}
      </SortableTableBody>
    ) : (
      <TableBody>{children}</TableBody>
    );

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {(headerActions || onAdd) && (
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            {onAdd && (
              <Button type="button" className="h-9 gap-1.5 px-3 text-sm" onClick={onAdd}>
                <Plus className="size-4" />
                Добавить
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{hint}</p>
      <div className={panelClass}>
        <Table className="text-sm [&_tbody_tr:last-child_td]:border-b-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">№</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Примечание</TableHead>
              <TableHead className="w-20">Цвет</TableHead>
              {showActions && <TableHead className={REORDER_ACTIONS_W} />}
            </TableRow>
          </TableHeader>
          {body}
        </Table>
      </div>
    </div>
  );
}
