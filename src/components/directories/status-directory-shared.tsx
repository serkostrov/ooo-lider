import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { panelClass, REORDER_ACTIONS_W } from "@/lib/ui";

/** Общая оболочка справочников статусов — вид 1:1. */
export function StatusDirectoryShell({
  title,
  hint,
  onAdd,
  showActions,
  children,
}: {
  title: string;
  hint: string;
  onAdd?: () => void;
  showActions?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {onAdd && (
          <Button type="button" className="h-9 gap-1.5 px-3 text-sm" onClick={onAdd}>
            <Plus className="size-4" />
            Добавить
          </Button>
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
          <TableBody>{children}</TableBody>
        </Table>
      </div>
    </div>
  );
}
