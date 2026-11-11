import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { panelClass, REORDER_ACTIONS_W, TH_H, thLabelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** Строки скелетона для `<TableBody>` справочников. */
export function DirectoryTableSkeleton({
  cols,
  rows = 8,
  withActions,
}: {
  cols: number;
  rows?: number;
  withActions?: boolean;
}) {
  const n = withActions ? cols + 1 : cols;
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          {Array.from({ length: n }, (_, c) => {
            const action = Boolean(withActions && c === n - 1);
            return (
              <TableCell key={c}>
                <Skeleton
                  height={action ? 32 : 16}
                  width={c === 0 ? "55%" : action ? 32 : `${60 + ((i + c) % 4) * 8}%`}
                  {...(action ? { borderRadius: 6 } : {})}
                />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

/** Скелетон для raw `<tbody>` (без ui/table). */
export function DirectoryHtmlTableSkeleton({
  cols,
  rows = 8,
}: {
  cols: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-border/60">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-5 py-3">
              <Skeleton height={16} width={`${55 + ((i + c) % 5) * 8}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Скелетон списка Reorderable (группы, типы, виды заявок). */
export function DirectoryListSkeleton({
  rows = 8,
  withActions = true,
  header,
}: {
  rows?: number;
  withActions?: boolean;
  header?: ReactNode;
}) {
  return (
    <div className={panelClass}>
      {header ? (
        <div className={cn("flex items-stretch border-b border-border bg-muted/40", TH_H)}>
          <div className="flex min-w-0 flex-1 items-center gap-3 px-5">{header}</div>
          {withActions && <div className={cn(REORDER_ACTIONS_W, "shrink-0 pr-3")} aria-hidden />}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex min-h-12 items-center gap-3 border-b border-border/60 px-5 py-2.5 last:border-b-0"
        >
          <Skeleton height={12} width={24} />
          <Skeleton height={16} width={`${50 + (i % 4) * 10}%`} containerClassName="flex-1" />
          {withActions && (
            <div className={cn(REORDER_ACTIONS_W, "flex justify-end pr-0")}>
              <Skeleton height={32} width={32} borderRadius={6} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function directoryListHeader(labels: string[]) {
  return (
    <>
      {labels.map((label, i) => (
        <div
          key={label}
          className={cn(thLabelClass, i === 0 ? "w-10 shrink-0" : "min-w-0 flex-1")}
        >
          {label}
        </div>
      ))}
    </>
  );
}
