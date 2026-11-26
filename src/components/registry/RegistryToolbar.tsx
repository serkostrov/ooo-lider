import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, ListFilter, Printer, X } from "lucide-react";
import { Toolbar } from "@/components/directories/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGISTRY_JOURNALS_KEY } from "@/components/directories/registry-journals/data";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import {
  useRegistryJournalFields,
  type RegistryEntry,
  type RegistryJournal,
  type RegistryJournalField,
} from "./data";
import { exportRegistryExcel, printRegistry } from "./exportRegistry";

export type ReplyStatusFilter = "all" | "pending" | "answered";
export type SourceFilter = "all" | "request" | "manual";

export type RegistryFilterState = {
  search: string;
  replyStatus: ReplyStatusFilter;
  source: SourceFilter;
  counterparty: string;
  objectName: string;
  outFrom: string;
  outTo: string;
  inFrom: string;
  inTo: string;
};

export const EMPTY_REGISTRY_FILTERS: RegistryFilterState = {
  search: "",
  replyStatus: "all",
  source: "all",
  counterparty: "all",
  objectName: "all",
  outFrom: "",
  outTo: "",
  inFrom: "",
  inTo: "",
};

export function hasReply(row: RegistryEntry): boolean {
  return !!(
    row.in_date ||
    (row.in_letter_no ?? "").trim() ||
    (row.in_content ?? "").trim()
  );
}

function inDateRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export function filterRegistryEntries(
  rows: RegistryEntry[],
  filters: RegistryFilterState,
): RegistryEntry[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.replyStatus === "pending" && hasReply(row)) return false;
    if (filters.replyStatus === "answered" && !hasReply(row)) return false;

    if (filters.source === "request" && !row.request_id) return false;
    if (filters.source === "manual" && row.request_id) return false;

    if (
      filters.counterparty !== "all" &&
      (row.counterparty ?? "").trim() !== filters.counterparty
    ) {
      return false;
    }

    if (
      filters.objectName !== "all" &&
      (row.object_name ?? "").trim() !== filters.objectName
    ) {
      return false;
    }

    if (!inDateRange(row.out_date, filters.outFrom, filters.outTo)) return false;
    if (!inDateRange(row.in_date, filters.inFrom, filters.inTo)) return false;

    if (!q) return true;
    const hay = [
      String(row.number),
      row.counterparty,
      row.out_content,
      row.in_content,
      row.in_letter_no,
      row.object_name,
      row.request_number != null ? String(row.request_number) : "вручную",
      ...Object.values(row.extra ?? {}).map((v) => (v == null ? "" : String(v))),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function registryActiveFilterCount(filters: RegistryFilterState): number {
  let n = 0;
  if (filters.replyStatus !== "all") n += 1;
  if (filters.source !== "all") n += 1;
  if (filters.counterparty !== "all") n += 1;
  if (filters.objectName !== "all") n += 1;
  if (filters.outFrom || filters.outTo) n += 1;
  if (filters.inFrom || filters.inTo) n += 1;
  return n;
}

export function RegistryToolbar({
  journalId,
  journalName,
  journals,
  rows,
  exportRows,
  filters,
  onChange,
  onAdd,
}: {
  journalId: string;
  journalName: string;
  /** Все журналы — каждый станет листом в Excel. */
  journals: RegistryJournal[];
  rows: RegistryEntry[];
  /** Текущая выборка (после поиска/фильтров) — для текущего листа и печати. */
  exportRows: RegistryEntry[];
  filters: RegistryFilterState;
  onChange: (next: RegistryFilterState) => void;
  onAdd?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const activeFilterCount = registryActiveFilterCount(filters);
  const { data: fields = [] } = useRegistryJournalFields(journalId);

  const exportAllSheets = () => {
    const sheets = journals.map((j) => {
      const sheetFields =
        j.id === journalId
          ? fields
          : (qc.getQueryData<RegistryJournalField[]>([
              ...REGISTRY_JOURNALS_KEY,
              "fields",
              j.id,
            ]) ?? []);
      const sheetRows =
        j.id === journalId
          ? exportRows
          : (qc.getQueryData<RegistryEntry[]>(["registry-entries", j.id]) ?? []);
      return { name: j.name, fields: sheetFields, rows: sheetRows };
    });
    exportRegistryExcel(sheets);
  };

  const counterparties = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const v = (row.counterparty ?? "").trim();
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [rows]);

  const objects = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const v = (row.object_name ?? "").trim();
      if (v) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [rows]);

  const patch = (partial: Partial<RegistryFilterState>) =>
    onChange({ ...filters, ...partial });

  const resetFilters = () =>
    onChange({
      ...EMPTY_REGISTRY_FILTERS,
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
      <Button
        type="button"
        variant="outline"
        title="Excel: каждый журнал — отдельный лист"
        aria-label="Excel"
        className="h-9 shrink-0 gap-1.5 px-2.5 text-sm"
        disabled={journals.every((j) => {
          if (j.id === journalId) return exportRows.length === 0;
          const cached = qc.getQueryData<RegistryEntry[]>(["registry-entries", j.id]);
          return !cached || cached.length === 0;
        })}
        onClick={exportAllSheets}
      >
        <FileSpreadsheet className="size-4 shrink-0" />
        <span className="hidden sm:inline">Excel</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        title="Печать"
        aria-label="Печать"
        className="h-9 shrink-0 gap-1.5 px-2.5 text-sm"
        disabled={exportRows.length === 0}
        onClick={() =>
          printRegistry({
            journalName,
            fields,
            rows: exportRows,
          })
        }
      >
        <Printer className="size-4 shrink-0" />
        <span className="hidden sm:inline">Печать</span>
      </Button>
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
          <PopoverContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
            <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto p-4">
              <FilterField label="Статус ответа">
                <Select
                  value={filters.replyStatus}
                  onValueChange={(v) => patch({ replyStatus: v as ReplyStatusFilter })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">
                      Все
                    </SelectItem>
                    <SelectItem value="pending" className="text-sm">
                      Ждёт ответа
                    </SelectItem>
                    <SelectItem value="answered" className="text-sm">
                      Есть ответ
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Источник">
                <Select
                  value={filters.source}
                  onValueChange={(v) => patch({ source: v as SourceFilter })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">
                      Все
                    </SelectItem>
                    <SelectItem value="request" className="text-sm">
                      Из заявки
                    </SelectItem>
                    <SelectItem value="manual" className="text-sm">
                      Вручную
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="Контрагент">
                <Select
                  value={filters.counterparty}
                  onValueChange={(v) => patch({ counterparty: v })}
                >
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">
                      Все
                    </SelectItem>
                    {counterparties.map((c) => (
                      <SelectItem key={c} value={c} className="text-sm">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              {objects.length > 0 ? (
                <FilterField label="Объект">
                  <Select
                    value={filters.objectName}
                    onValueChange={(v) => patch({ objectName: v })}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        Все
                      </SelectItem>
                      {objects.map((name) => (
                        <SelectItem key={name} value={name} className="text-sm">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              ) : null}

              <DateRange
                label="Дата исходящего"
                from={filters.outFrom}
                to={filters.outTo}
                onFrom={(outFrom) => patch({ outFrom })}
                onTo={(outTo) => patch({ outTo })}
              />
              <DateRange
                label="Дата входящего"
                from={filters.inFrom}
                to={filters.inTo}
                onFrom={(inFrom) => patch({ inFrom })}
                onTo={(inTo) => patch({ inTo })}
              />
            </div>
            {activeFilterCount > 0 ? (
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full text-sm"
                  onClick={() => {
                    resetFilters();
                    setOpen(false);
                  }}
                >
                  Сбросить фильтры
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="inline-flex items-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={resetFilters}
            title="Сбросить фильтры"
            aria-label="Сбросить фильтры"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </Toolbar>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={fieldStackClass}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </div>
  );
}

function DateRange({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className={fieldStackClass}>
      <span className={fieldLabelClass}>{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          className="h-9 text-sm"
          aria-label={`${label}: с`}
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => onTo(e.target.value)}
          className="h-9 text-sm"
          aria-label={`${label}: по`}
        />
      </div>
    </div>
  );
}
