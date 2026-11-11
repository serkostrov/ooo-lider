import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { FileSpreadsheet, ListFilter, Plus, Printer, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { exportXlsx, printTable, type Column } from "@/lib/export";
import { sortRows, useTableSort } from "@/lib/table-sort";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toolbar } from "@/components/directories/common";
import { SortableTh } from "@/components/SortableTh";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { useObjects } from "@/components/objects/data";
import { useObjectStages } from "@/components/stages/data";
import { NewRequestDialog } from "./NewRequestDialog";
import {
  useRequestStatuses,
  RequestStatusBadge,
  formatValue,
  overdueDays,
  sortRequests,
  stageCallLabel,
  statusInfo,
  useFieldValues,
  useRequests,
  type FieldValue,
  type RequestRow,
} from "./data";

const ALL = "__all";

type ReqSort =
  | "number"
  | "created"
  | "call"
  | "type"
  | "object"
  | "data"
  | "status"
  | "initiator"
  | "office";


type Filters = {
  object: string;
  type: string;
  status: string;
  from: string;
  to: string;
  onlyOpen: boolean;
  onlyOverdue: boolean;
  archive: boolean;
};

/** Ключевые поля для колонки: первые 3 непустых, кроме файлов. */
function keyFields(values: FieldValue[]) {
  return values
    .filter((v) => v.field_type !== "file" && formatValue(v.field_type, v.value) !== "")
    .slice(0, 3)
    .map((v) => `${v.label}: ${formatValue(v.field_type, v.value)}`);
}

export function RequestsList({
  objectId,
  typeId,
  onTypeChange,
  createOpen: createOpenProp,
  onCreateOpenChange,
  hideCreateButton = false,
  fillHeight = false,
  chromeHost,
}: {
  /** Если задан — список одного объекта (колонка и фильтр «Объект» скрыты). */
  objectId?: string;
  /** Контролируемый фильтр вида (URL на странице объекта). */
  typeId?: string | undefined;
  onTypeChange?: (typeId: string | undefined) => void;
  /** Управление диалогом создания снаружи (кнопка в шапке страницы). */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  /** Скрыть «Создать заявку» в тулбаре (если кнопка уже в шапке). */
  hideCreateButton?: boolean;
  /** Занять высоту родителя: тулбар сверху, таблица скроллится. */
  fillHeight?: boolean;
  /** Если задан — поиск/фильтры/Excel рендерятся сюда (строка с табами на карточке объекта). */
  chromeHost?: HTMLElement | null;
}) {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useRequests(objectId);
  const { data: types = [] } = useRequestTypes();
  const statuses = useRequestStatuses();
  const { data: objects = [] } = useObjects();
  const { data: stages = [] } = useObjectStages(objectId ?? "");
  const ids = rows.map((r) => r.id);
  const { data: values = [] } = useFieldValues(ids, objectId ?? "all");

  const stageNumberById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of stages) m[s.id] = s.number;
    return m;
  }, [stages]);

  const callLabel = (r: RequestRow) =>
    objectId ? stageCallLabel(r, rows, stageNumberById) : null;

  const [search, setSearch] = useState("");
  const [createOpenLocal, setCreateOpenLocal] = useState(false);
  const createControlled = onCreateOpenChange != null;
  const createOpen = createControlled ? (createOpenProp ?? false) : createOpenLocal;
  const setCreateOpen = createControlled ? onCreateOpenChange! : setCreateOpenLocal;
  const defaults: Filters = {
    object: ALL,
    type: ALL,
    status: ALL,
    from: "",
    to: "",
    onlyOpen: true,
    onlyOverdue: false,
    archive: false,
  };
  const [f, setF] = useState<Filters>(defaults);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  /** Вид зафиксирован снаружи без колбэка (напр. роль снабжения). */
  const typeLocked = !!typeId && !onTypeChange;
  const typeSelect = onTypeChange ? (typeId ?? ALL) : typeLocked ? typeId! : f.type;
  const effectiveType = typeLocked ? typeId : typeSelect === ALL ? undefined : typeSelect;
  const setType = (v: string) => {
    if (onTypeChange) onTypeChange(v === ALL ? undefined : v);
    else set("type", v);
  };

  const showObject = !objectId;
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (showObject && f.object !== ALL) n++;
    if (!typeLocked && typeSelect !== ALL) n++;
    if (f.status !== ALL) n++;
    if (f.from) n++;
    if (f.to) n++;
    if (f.archive) n++;
    else {
      if (!f.onlyOpen) n++;
      if (f.onlyOverdue) n++;
    }
    return n;
  }, [showObject, typeLocked, typeSelect, f]);

  const resetFilters = () => {
    setF(defaults);
    if (onTypeChange) onTypeChange(undefined);
  };

  const valuesByRequest = useMemo(() => {
    const m: Record<string, FieldValue[]> = {};
    for (const v of values) (m[v.request_id] ??= []).push(v);
    return m;
  }, [values]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^№/, "");
    return rows.filter((r) => {
      if (f.object !== ALL && r.object_id !== f.object) return false;
      if (effectiveType && r.request_type_id !== effectiveType) return false;
      if (f.status !== ALL && r.status !== f.status) return false;
      if (f.from && r.call_date < f.from) return false;
      if (f.to && r.call_date > f.to) return false;
      if (f.archive) {
        if (r.status !== "done") return false;
      } else if (f.onlyOpen && r.status === "done") {
        return false;
      }
      if (f.onlyOverdue && !r.is_overdue) return false;
      if (q) {
        const stageLabel = objectId ? stageCallLabel(r, rows, stageNumberById) : null;
        const hay = [
          String(r.number),
          stageLabel,
          r.type_name,
          r.object_name,
          r.representative_name,
          r.result_text,
          ...(valuesByRequest[r.id] ?? []).map((v) => formatValue(v.field_type, v.value)),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, f, effectiveType, search, valuesByRequest, objectId, stageNumberById]);

  const { sort, toggle } = useTableSort<ReqSort>();
  const getters = useMemo(
    () =>
      ({
        number: (r: RequestRow) => r.number,
        created: (r: RequestRow) => r.created_at,
        call: (r: RequestRow) => r.call_date,
        type: (r: RequestRow) => r.type_name,
        object: (r: RequestRow) => r.object_name,
        data: (r: RequestRow) =>
          [...keyFields(valuesByRequest[r.id] ?? []), r.result_text ?? ""].join(" "),
        status: (r: RequestRow) => statusInfo(r.status, statuses).label,
        initiator: (r: RequestRow) => r.initiator_name,
        office: (r: RequestRow) => r.office_name,
      }) satisfies Record<ReqSort, (r: RequestRow) => unknown>,
    [valuesByRequest, statuses],
  );
  const sorted = useMemo(() => {
    if (!sort) return sortRequests(visible);
    return sortRows(visible, sort, getters);
  }, [visible, sort, getters]);

  const columns: Column<RequestRow>[] = [
    {
      header: "№",
      value: (r) => callLabel(r) ?? r.number,
      width: 7,
    },
    { header: "Дата формирования", value: (r) => formatDate(r.created_at), width: 12 },
    { header: "Дата вызова", value: (r) => formatDate(r.call_date), width: 12 },
    { header: "Вид", value: (r) => r.type_name, width: 18 },
    ...(showObject ? [{ header: "Объект", value: (r: RequestRow) => r.object_name, width: 35 }] : []),
    { header: "Кого вызываем", value: (r) => r.representative_name, width: 18 },
    { header: "Поля", value: (r) => keyFields(valuesByRequest[r.id] ?? []).join("; "), width: 40 },
    { header: "Статус", value: (r) => statusInfo(r.status, statuses).label + (r.is_overdue ? ` (не исполнена ${overdueDays(r)} дн.)` : ""), width: 22 },
    { header: "Результат", value: (r) => r.result_text, width: 20 },
    { header: "Инициатор", value: (r) => r.initiator_name, width: 20 },
    { header: "Офис-менеджер", value: (r) => r.office_name, width: 20 },
  ];

  const chrome = (
    <Toolbar
      search={search}
      onSearch={setSearch}
      className={cn(
        "mb-0 min-w-0",
        // flex-1 только в строке с табами объекта; на /requests иначе тулбар раздувается и таблица уезжает вниз
        chromeHost ? "w-full flex-1" : "shrink-0",
      )}
    >
      <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-md border border-border">
        <Popover>
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
            <div className="space-y-3 p-4">
              {showObject && (
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Объект</span>
                  <Select value={f.object} onValueChange={(v) => set("object", v)}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все объекты
                      </SelectItem>
                      {objects.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-sm">
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!typeLocked && (
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Вид</span>
                  <Select value={typeSelect} onValueChange={setType}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue placeholder="Все виды" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все виды
                      </SelectItem>
                      {types
                        .filter((t) => t.is_active || t.id === typeSelect)
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-sm">
                            {t.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={fieldStackClass}>
                <span className={fieldLabelClass}>Статус</span>
                <Select value={f.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-sm">
                      Все статусы
                    </SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s.v} value={s.v} className="text-sm">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={fieldStackClass}>
                <span className={fieldLabelClass}>Период</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={f.from}
                    onChange={(e) => set("from", e.target.value)}
                    className="h-9 text-sm"
                    aria-label="Дата с"
                  />
                  <Input
                    type="date"
                    value={f.to}
                    onChange={(e) => set("to", e.target.value)}
                    className="h-9 text-sm"
                    aria-label="Дата по"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Архив</span>
                <Switch
                  checked={f.archive}
                  onCheckedChange={(v) =>
                    setF((x) => ({
                      ...x,
                      archive: v,
                      onlyOpen: v ? false : x.onlyOpen,
                      onlyOverdue: v ? false : x.onlyOverdue,
                    }))
                  }
                />
              </label>
              {!f.archive && (
                <>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Незакрытые</span>
                    <Switch checked={f.onlyOpen} onCheckedChange={(v) => set("onlyOpen", v)} />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Просроченные</span>
                    <Switch checked={f.onlyOverdue} onCheckedChange={(v) => set("onlyOverdue", v)} />
                  </label>
                </>
              )}
            </div>
            {activeFilterCount > 0 && (
              <div className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full text-sm"
                  onClick={resetFilters}
                >
                  Сбросить фильтры
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="inline-flex items-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={resetFilters}
            title="Сбросить фильтры"
            aria-label="Сбросить фильтры"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Button
        variant="outline"
        className="h-9 shrink-0 gap-1.5 px-3 text-sm"
        disabled={sorted.length === 0}
        onClick={() => exportXlsx(`Заявки — ${formatDate(mskToday())}`, "Заявки", columns, sorted)}
      >
        <FileSpreadsheet className="size-4" />
        Excel
      </Button>
      <Button
        variant="outline"
        className="h-9 shrink-0 gap-1.5 px-3 text-sm"
        disabled={sorted.length === 0}
        onClick={() =>
          printTable(
            "Заявки",
            `Сформировано ${formatDate(mskToday())}. Заявок в списке: ${sorted.length}`,
            columns,
            sorted,
          )
        }
      >
        <Printer className="size-4" />
        Печать
      </Button>
      {!hideCreateButton && (
        <Button onClick={() => setCreateOpen(true)} className="h-9 shrink-0 gap-2 px-3 text-sm">
          <Plus className="size-4" />
          Создать заявку
        </Button>
      )}
    </Toolbar>
  );

  return (
    <div className={cn(fillHeight && "flex h-full min-h-0 flex-col gap-3")}>
      <NewRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        objectId={objectId}
        typeId={effectiveType}
      />
      {chromeHost ? createPortal(chrome, chromeHost) : chrome}

      {/* Один overflow: иначе sticky thead не работает во вложенном overflow-x-auto */}
      <div
        className={cn(
          "overflow-auto rounded-md border border-border bg-card",
          fillHeight && "min-h-0 flex-1",
        )}
      >
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_0_0_var(--border)]">
            <tr>
              <SortableTh column="number" sort={sort} onToggle={toggle} className="w-28">№</SortableTh>
              <SortableTh column="created" sort={sort} onToggle={toggle}>Сформирована</SortableTh>
              <SortableTh column="call" sort={sort} onToggle={toggle}>Вызов на</SortableTh>
              <SortableTh column="type" sort={sort} onToggle={toggle}>Вид</SortableTh>
              {showObject && (
                <SortableTh column="object" sort={sort} onToggle={toggle}>Объект</SortableTh>
              )}
              <SortableTh column="data" sort={sort} onToggle={toggle}>Данные</SortableTh>
              <SortableTh column="status" sort={sort} onToggle={toggle}>Статус</SortableTh>
              <SortableTh column="initiator" sort={sort} onToggle={toggle}>Инициатор</SortableTh>
              <SortableTh column="office" sort={sort} onToggle={toggle}>Офис-менеджер</SortableTh>
            </tr>
          </thead>
          <tbody>
            {isLoading ? null : sorted.length === 0 ? (
              <tr>
                <td colSpan={showObject ? 9 : 8} className="px-5 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {rows.length === 0
                        ? "Заявок пока нет"
                        : activeFilterCount > 0 || search.trim()
                          ? "По выбранным фильтрам ничего не найдено"
                          : "Ничего не найдено"}
                    </p>
                    {(activeFilterCount > 0 || search.trim()) && rows.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-4 text-sm"
                        onClick={() => {
                          resetFilters();
                          setSearch("");
                        }}
                      >
                        Сбросить фильтры
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const tone = r.is_overdue
                  ? "bg-danger-soft"
                  : r.status === "done"
                    ? "bg-success-soft/60"
                    : "";
                const dataLine = [
                  ...keyFields(valuesByRequest[r.id] ?? []),
                  ...(r.result_text ? [`Результат: ${r.result_text}`] : []),
                ].join(" · ");
                const typeLine = [r.type_name, r.representative_name].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={r.id}
                    onClick={() =>
                      navigate({
                        to: "/requests/$requestId",
                        params: { requestId: r.id },
                        search: objectId ? { from: "object" } : {},
                      })
                    }
                    className={`h-12 cursor-pointer border-t transition-colors hover:bg-elevated/50 ${tone}`}
                    title={[r.type_name, r.object_name, dataLine].filter(Boolean).join("\n")}
                  >
                    <td className="max-w-[7rem] px-5 py-2.5 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="shrink-0 font-semibold tabular-nums"
                          title={callLabel(r) ? `Сквозной №${r.number}` : undefined}
                        >
                          {callLabel(r) ?? r.number}
                        </span>
                        {r.is_new && (
                          <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[11px] font-semibold leading-none text-danger-foreground">
                            Новая
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle tabular-nums">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle">
                      <div className={`inline-flex items-center gap-1.5 tabular-nums ${r.is_overdue ? "text-danger" : ""}`}>
                        <span className="font-medium">{formatDate(r.call_date)}</span>
                        {r.is_overdue && (
                          <span
                            className="rounded-md bg-danger-soft px-1 py-0.5 text-[11px] font-semibold leading-none text-danger"
                            title={`Просрочено ${overdueDays(r)} дн.`}
                          >
                            −{overdueDays(r)}д
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[10rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={typeLine}>{typeLine}</div>
                    </td>
                    {showObject && (
                      <td className="max-w-[14rem] px-5 py-2.5 align-middle">
                        <div className="truncate" title={r.object_name ?? undefined}>{r.object_name}</div>
                      </td>
                    )}
                    <td className="max-w-[18rem] px-5 py-2.5 align-middle text-xs text-muted-foreground">
                      <div className="truncate" title={dataLine || undefined}>{dataLine || "—"}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle">
                      <RequestStatusBadge status={r.status} />
                    </td>
                    <td className="max-w-[9rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={r.initiator_name ?? undefined}>{r.initiator_name}</div>
                    </td>
                    <td className="max-w-[9rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={r.office_name ?? undefined}>{r.office_name}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
