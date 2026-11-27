import { Fragment, useMemo } from "react";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { EmptyRow } from "@/components/directories/common";
import { DirectoryTableSkeleton } from "@/components/directories/DirectorySkeleton";
import {
  childrenOf,
  isGroupKind,
  kindLabel,
  type ExternalContact,
} from "@/components/directories/ExternalContactsDirectory";
import { splitMultiContacts } from "@/components/directories/rules";
import { cn } from "@/lib/utils";

type SortKey = "kind" | "full_name" | "customer" | "position" | "phone" | "email" | "active";

const GETTERS: Record<SortKey, (r: ExternalContact) => unknown> = {
  kind: (r) => r.kind,
  full_name: (r) => r.full_name,
  customer: (r) => r.customer_name,
  position: (r) => r.position,
  phone: (r) => r.phone,
  email: (r) => r.email,
  active: (r) => r.is_active,
};

function MultiContactCell({ value }: { value: string | null }) {
  const parts = splitMultiContacts(value)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return "—";
  return (
    <div className="flex flex-col gap-0.5 leading-snug">
      {parts.map((p) => (
        <span key={p} className="whitespace-nowrap">
          {p}
        </span>
      ))}
    </div>
  );
}

export function ExternalContactsTable({
  rows,
  allRows,
  isLoading,
  isError,
  canEdit,
  showCustomerColumn,
  onEdit,
}: {
  rows: ExternalContact[];
  /** Полный каталог — для вложенных людей. */
  allRows: ExternalContact[];
  isLoading: boolean;
  isError: boolean;
  canEdit: boolean;
  showCustomerColumn: boolean;
  onEdit: (row: ExternalContact) => void;
}) {
  const { sort, toggle } = useTableSort<SortKey>();
  const sorted = useSortedRows(rows, sort, GETTERS);
  const cols = showCustomerColumn ? 7 : 6;

  const kidsByParent = useMemo(() => {
    const map = new Map<string, ExternalContact[]>();
    for (const r of sorted) {
      if (!isGroupKind(r.kind)) continue;
      map.set(r.id, childrenOf(allRows, r.id));
    }
    return map;
  }, [sorted, allRows]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <SortableTh as="table" column="kind" sort={sort} onToggle={toggle}>
              Тип
            </SortableTh>
            <SortableTh as="table" column="full_name" sort={sort} onToggle={toggle}>
              ФИО / название
            </SortableTh>
            {showCustomerColumn ? (
              <SortableTh as="table" column="customer" sort={sort} onToggle={toggle}>
                Заказчик
              </SortableTh>
            ) : null}
            <SortableTh
              as="table"
              column="position"
              sort={sort}
              onToggle={toggle}
              className="min-w-[16rem]"
            >
              Должность
            </SortableTh>
            <SortableTh
              as="table"
              column="phone"
              sort={sort}
              onToggle={toggle}
              className="min-w-[11rem]"
            >
              Телефон
            </SortableTh>
            <SortableTh
              as="table"
              column="email"
              sort={sort}
              onToggle={toggle}
              className="min-w-[12rem]"
            >
              Почта
            </SortableTh>
            <SortableTh as="table" column="active" sort={sort} onToggle={toggle}>
              Активен
            </SortableTh>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <DirectoryTableSkeleton cols={cols} />
          ) : isError || sorted.length === 0 ? (
            <EmptyRow cols={cols} />
          ) : (
            sorted.map((r) => {
              const kids = kidsByParent.get(r.id) ?? [];
              return (
                <Fragment key={r.id}>
                  <TableRow
                    className={canEdit ? "cursor-pointer" : ""}
                    onClick={() => canEdit && onEdit(r)}
                  >
                    <TableCell className="align-middle whitespace-nowrap text-muted-foreground">
                      {kindLabel(r.kind)}
                      {kids.length > 0 ? (
                        <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground/80">
                          · {kids.length}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-[12rem] align-middle font-medium">
                      {r.full_name}
                    </TableCell>
                    {showCustomerColumn ? (
                      <TableCell className="align-middle whitespace-nowrap text-muted-foreground">
                        {r.customer_name ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="min-w-[16rem] max-w-[28rem] align-middle">
                      {r.position ?? "—"}
                    </TableCell>
                    <TableCell className="min-w-[11rem] align-middle">
                      <MultiContactCell value={r.phone} />
                    </TableCell>
                    <TableCell className="min-w-[12rem] align-middle">
                      <MultiContactCell value={r.email} />
                    </TableCell>
                    <TableCell className="align-middle">
                      {r.is_active ? "Да" : "Нет"}
                    </TableCell>
                  </TableRow>
                  {kids.map((k) => (
                    <TableRow
                      key={k.id}
                      className={cn(
                        "bg-muted/25",
                        canEdit ? "cursor-pointer" : "",
                      )}
                      onClick={() => canEdit && onEdit(r)}
                      title="Открыть группу"
                    >
                      <TableCell className="align-middle whitespace-nowrap pl-6 text-muted-foreground">
                        └ контакт
                      </TableCell>
                      <TableCell className="min-w-[12rem] align-middle pl-6 font-medium">
                        {k.full_name}
                      </TableCell>
                      {showCustomerColumn ? (
                        <TableCell className="align-middle whitespace-nowrap text-muted-foreground">
                          {k.customer_name ?? r.customer_name ?? "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="min-w-[16rem] max-w-[28rem] align-middle">
                        {k.position ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-[11rem] align-middle">
                        <MultiContactCell value={k.phone} />
                      </TableCell>
                      <TableCell className="min-w-[12rem] align-middle">
                        <MultiContactCell value={k.email} />
                      </TableCell>
                      <TableCell className="align-middle">
                        {k.is_active ? "Да" : "Нет"}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
