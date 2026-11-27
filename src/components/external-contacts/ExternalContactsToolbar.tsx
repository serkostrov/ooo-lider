import { useState, type ReactNode } from "react";
import { ListFilter, X } from "lucide-react";
import { Toolbar } from "@/components/directories/common";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import {
  EXTERNAL_CONTACT_KINDS,
  kindLabel,
  type ExternalContact,
  type ExternalContactKind,
} from "@/components/directories/ExternalContactsDirectory";

export type KindFilter = "all" | ExternalContactKind;
export type ActiveFilter = "all" | "active" | "inactive";

export type ExternalContactsFilterState = {
  search: string;
  kind: KindFilter;
  active: ActiveFilter;
};

export const EMPTY_EXTERNAL_CONTACTS_FILTERS: ExternalContactsFilterState = {
  search: "",
  kind: "all",
  active: "all",
};

function contactHaystack(row: ExternalContact) {
  return [
    row.full_name,
    row.position,
    row.phone,
    row.email,
    row.comment,
    row.customer_name,
    kindLabel(row.kind),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function filterExternalContacts(
  rows: ExternalContact[],
  filters: ExternalContactsFilterState,
  /** null — все; "" — без заказчика; uuid — конкретный. */
  customerId: string | null,
): ExternalContact[] {
  const q = filters.search.trim().toLowerCase();
  const childrenByParent = new Map<string, ExternalContact[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = childrenByParent.get(row.parent_id);
    if (list) list.push(row);
    else childrenByParent.set(row.parent_id, [row]);
  }

  return rows.filter((row) => {
    // В таблице только корневые; вложенные видны под группой.
    if (row.parent_id) return false;

    if (customerId === "") {
      if (row.customer_id) return false;
    } else if (customerId != null) {
      if (row.customer_id !== customerId) return false;
    }

    if (filters.kind !== "all" && row.kind !== filters.kind) return false;
    if (filters.active === "active" && !row.is_active) return false;
    if (filters.active === "inactive" && row.is_active) return false;

    if (!q) return true;
    if (contactHaystack(row).includes(q)) return true;
    const kids = childrenByParent.get(row.id) ?? [];
    return kids.some((k) => contactHaystack(k).includes(q));
  });
}

export function externalContactsActiveFilterCount(
  filters: ExternalContactsFilterState,
): number {
  let n = 0;
  if (filters.kind !== "all") n += 1;
  if (filters.active !== "all") n += 1;
  return n;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={fieldStackClass}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </div>
  );
}

export function ExternalContactsToolbar({
  filters,
  onChange,
  onAdd,
}: {
  filters: ExternalContactsFilterState;
  onChange: (next: ExternalContactsFilterState) => void;
  onAdd?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const activeFilterCount = externalContactsActiveFilterCount(filters);

  const patch = (partial: Partial<ExternalContactsFilterState>) =>
    onChange({ ...filters, ...partial });

  const resetFilters = () =>
    onChange({
      ...EMPTY_EXTERNAL_CONTACTS_FILTERS,
      search: filters.search,
    });

  return (
    <Toolbar
      search={filters.search}
      onSearch={(search) => patch({ search })}
      onAdd={onAdd}
      addLabel="Добавить"
      className="mb-0"
      split
    >
      <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-md border border-border">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ListFilter className="size-4" />
              Фильтры
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(100vw-2rem,20rem)] p-0">
            <div className="space-y-3 p-4">
              <FilterField label="Тип">
                <Select
                  value={filters.kind}
                  onValueChange={(v) => patch({ kind: v as KindFilter })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">
                      Все
                    </SelectItem>
                    {EXTERNAL_CONTACT_KINDS.map((k) => (
                      <SelectItem key={k.v} value={k.v} className="text-sm">
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Активность">
                <Select
                  value={filters.active}
                  onValueChange={(v) => patch({ active: v as ActiveFilter })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">
                      Все
                    </SelectItem>
                    <SelectItem value="active" className="text-sm">
                      Активные
                    </SelectItem>
                    <SelectItem value="inactive" className="text-sm">
                      Неактивные
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
            {activeFilterCount > 0 ? (
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-full gap-1.5 text-sm"
                  onClick={() => {
                    resetFilters();
                    setOpen(false);
                  }}
                >
                  <X className="size-3.5" />
                  Сбросить фильтры
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </Toolbar>
  );
}
