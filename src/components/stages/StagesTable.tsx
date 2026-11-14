import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronRight, Flag, ListFilter, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { daysBetween, mskToday } from "@/lib/dates";
import { sortRows, useTableSort, type SortState } from "@/lib/table-sort";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { SortableTh, type ThResizeProps } from "@/components/SortableTh";
import { TableColgroup } from "@/components/TableColgroup";
import { useTableColumnWidths, type ColumnWidthDef, type ColumnWidths } from "@/lib/table-column-widths";
import { ConditionToggle } from "./ConditionToggle";
import {
  StatusBadge,
  useObjectConditions,
  useObjectPredecessors,
  useObjectStages,
  useRefreshStages,
  type ObjectStage,
  type StageCondition,
} from "./data";

const STAGE_COLUMNS_CORE: ColumnWidthDef[] = [
  { id: "number", defaultWidth: 56, minWidth: 44, maxWidth: 100 },
  { id: "name", defaultWidth: 240, minWidth: 120 },
  { id: "conditions", defaultWidth: 280, minWidth: 140 },
  { id: "due", defaultWidth: 112, minWidth: 80, maxWidth: 160 },
  { id: "status", defaultWidth: 140, minWidth: 100, maxWidth: 220 },
  { id: "confirmer", defaultWidth: 150, minWidth: 100 },
];

const STAGE_EXECUTOR_COL: ColumnWidthDef = {
  id: "executor",
  defaultWidth: 180,
  minWidth: 100,
};

function stageColumns(showExecutor: boolean): ColumnWidthDef[] {
  if (!showExecutor) return STAGE_COLUMNS_CORE;
  const out = [...STAGE_COLUMNS_CORE];
  out.splice(5, 0, STAGE_EXECUTOR_COL);
  return out;
}

/** Группы — по виду работ; даты — по сроку; порядок — DnD / sort. */
export type StagesViewMode = "groups" | "dates" | "order";
const STAGES_VIEW_KEY = "lider.stages.view";
const STAGES_VIEW_MODES: StagesViewMode[] = ["groups", "dates", "order"];

function useStagesView(): [StagesViewMode, (v: StagesViewMode) => void] {
  const [view, setView] = useState<StagesViewMode>(() => {
    try {
      const saved = localStorage.getItem(STAGES_VIEW_KEY);
      if (saved && STAGES_VIEW_MODES.includes(saved as StagesViewMode)) return saved as StagesViewMode;
    } catch {
      /* ignore */
    }
    return "groups";
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(STAGES_VIEW_KEY, v);
      } catch {
        /* ignore */
      }
    },
  ];
}

/** Плоский список: колоночная сортировка или дефолт режима (срок / DnD). */
function flatStagesForView(
  rows: ObjectStage[],
  view: Exclude<StagesViewMode, "groups">,
  sort: SortState<StageSort> | null,
): ObjectStage[] {
  if (sort) return sortRows(rows, sort, STAGE_GETTERS);
  if (view === "dates") return sortRows(rows, { key: "due", dir: "asc" }, STAGE_GETTERS);
  return flattenStagesHierarchy(rows);
}

type StageSort = "number" | "name" | "conditions" | "due" | "status" | "executor" | "confirmer";

const STAGE_GETTERS: Record<StageSort, (s: ObjectStage) => unknown> = {
  number: (s) => s.code || String(s.number),
  name: (s) => s.name,
  conditions: (s) => (s.conditions_total ? s.conditions_done / s.conditions_total : -1),
  due: (s) => s.due_date,
  status: (s) => s.status_name,
  executor: (s) => s.executor_name,
  confirmer: (s) => s.confirmer_name ?? s.confirmer_role_name,
};

/** Топ-уровень + дети сразу под родителем (DFS по sort). */
export function flattenStagesHierarchy(stages: ObjectStage[]): ObjectStage[] {
  const tops = stages.filter((s) => !s.parent_id).sort((a, b) => a.sort - b.sort || a.number - b.number);
  const out: ObjectStage[] = [];
  for (const t of tops) {
    out.push(t);
    out.push(
      ...stages
        .filter((s) => s.parent_id === t.id)
        .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code, "ru")),
    );
  }
  return out;
}


const ALL = "__all";
const NOBODY = "__nobody";

export type StagesTableFilters = {
  workType: string;
  executor: string;
  onlyOverdue: boolean;
  onlyOpen: boolean;
  showExcluded: boolean;
};

/** Видимые строки таблицы с учётом фильтров — их же выгружаем в Excel и печатаем. */
export function filterStages(stages: ObjectStage[], f: StagesTableFilters) {
  return stages.filter(
    (s) =>
      (f.showExcluded || !s.is_excluded) &&
      (f.workType === ALL || (s.work_type_id ?? "") === f.workType) &&
      (f.executor === ALL || (f.executor === NOBODY ? !s.executor_id : s.executor_id === f.executor)) &&
      (!f.onlyOverdue || s.is_overdue || s.is_no_response) &&
      (!f.onlyOpen || !s.is_closed),
  );
}

/** Подсветка строки по разделу 8 ТЗ — мягкая, без конкурирующих заливок. */
export function rowTone(s: ObjectStage) {
  if (s.is_excluded) return "bg-muted/40 text-muted-foreground";
  if (s.is_overdue || s.is_no_response) return "bg-danger-soft/50";
  if (s.is_due_soon) return "bg-warning-soft/40";
  return "";
}

export function StagesTable({
  objectId,
  toolbar,
  chromeHost,
}: {
  objectId: string;
  /** Дополнительные кнопки панели (Excel, печать) получают видимые строки. */
  toolbar?: (visible: ObjectStage[]) => ReactNode;
  /** Если задан — фильтры/Excel рендерятся сюда (одна строка с табами), иначе над таблицей. */
  chromeHost?: HTMLElement | null;
}) {
  const { role_code, is_admin } = useProfile();
  const showExecutor = is_admin || role_code !== "foreman";
  const columns = useMemo(() => stageColumns(showExecutor), [showExecutor]);
  const { widths: colWidths, totalWidth: colsTotal, resizeProps } = useTableColumnWidths(
    showExecutor ? "object-stages" : "object-stages-no-exec",
    columns,
  );
  const { data: stages = [], isLoading } = useObjectStages(objectId);
  const ids = stages.map((s) => s.id);
  const { data: conditions = [] } = useObjectConditions(objectId, ids);
  const { data: preds = {} } = useObjectPredecessors(objectId, ids);
  const refresh = useRefreshStages();

  const [view, setView] = useStagesView();
  const [f, setF] = useState<StagesTableFilters>({
    workType: ALL,
    executor: ALL,
    onlyOverdue: false,
    onlyOpen: false,
    showExcluded: false,
  });
  const [closedOpen, setClosedOpen] = useState(false);
  const { sort, toggle } = useTableSort<StageSort>();

  const workTypes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages) if (s.work_type_id) m.set(s.work_type_id, s.work_type_name ?? "");
    return [...m.entries()];
  }, [stages]);
  const executors = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages) if (s.executor_id) m.set(s.executor_id, s.executor_name ?? "");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [stages]);

  const condByStage = useMemo(() => {
    const m: Record<string, StageCondition[]> = {};
    for (const c of conditions) (m[c.stage_id] ??= []).push(c);
    return m;
  }, [conditions]);
  const codeById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.code || String(s.number)])), [stages]);

  const visible = filterStages(stages, f);
  const open = visible.filter((s) => !s.is_closed);
  const closed = visible.filter((s) => s.is_closed);

  // Группы по видам работ; внутри — иерархия (подэтапы под родителем)
  const groups = useMemo(() => {
    const order: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const s of stages) {
      const id = s.work_type_id ?? "";
      if (!seen.has(id)) {
        seen.add(id);
        order.push({ id, name: s.work_type_name ?? "Без группы" });
      }
    }
    return order
      .map((g) => {
        const inGroup = open.filter((s) => (s.work_type_id ?? "") === g.id);
        const hierarchical = flattenStagesHierarchy(inGroup);
        const rows = sort
          ? sortRows(inGroup, sort, STAGE_GETTERS)
          : hierarchical;
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [stages, open, sort]);

  const openFlat = useMemo(() => {
    if (view === "groups") return [] as ObjectStage[];
    return flatStagesForView(open, view, sort);
  }, [open, view, sort]);

  const closedSorted = useMemo(() => {
    if (view === "groups") {
      if (sort) return sortRows(closed, sort, STAGE_GETTERS);
      return flattenStagesHierarchy(closed);
    }
    return flatStagesForView(closed, view, sort);
  }, [closed, view, sort]);

  if (isLoading) {
    return <StagesTableSkeleton showExecutor={showExecutor} columns={columns} widths={colWidths} totalWidth={colsTotal} />;
  }

  const set = <K extends keyof StagesTableFilters>(k: K, v: StagesTableFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const onChanged = () => refresh(objectId);
  const showGroup = view !== "groups";
  const rowProps = { objectId, condByStage, preds, codeById, onChanged, showGroup };

  const activeFilterCount =
    (f.workType !== ALL ? 1 : 0) +
    (f.executor !== ALL ? 1 : 0) +
    (f.onlyOverdue ? 1 : 0) +
    (f.onlyOpen ? 1 : 0) +
    (f.showExcluded ? 1 : 0);

  const resetFilters = () =>
    setF({
      workType: ALL,
      executor: ALL,
      onlyOverdue: false,
      onlyOpen: false,
      showExcluded: false,
    });

  const hasOpenRows = view === "groups" ? groups.length > 0 : openFlat.length > 0;

  const viewButtons: { id: StagesViewMode; label: string; title: string }[] = [
    { id: "groups", label: "Группы", title: "По группам работ" },
    { id: "dates", label: "Даты", title: "По сроку этапа" },
    { id: "order", label: "Порядок", title: "В порядке DnD / добавления" },
  ];

  const chrome = (
    <>
      <div
        className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-md border border-border"
        role="group"
        aria-label="Вид этапов"
      >
        {viewButtons.map((b, i) => (
          <button
            key={b.id}
            type="button"
            title={b.title}
            aria-pressed={view === b.id}
            onClick={() => setView(b.id)}
            className={cn(
              "px-3 text-sm transition-colors",
              i > 0 && "border-l border-border",
              view === b.id
                ? "bg-primary/14 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
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
          <PopoverContent align="end" className="w-[min(100vw-2rem,20rem)] p-0">
            <div className="space-y-3 p-4">
              <div className={fieldStackClass}>
                <span className={fieldLabelClass}>Группа</span>
                <Select value={f.workType} onValueChange={(v) => set("workType", v)}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-sm">
                      Все группы
                    </SelectItem>
                    {workTypes.map(([id, name]) => (
                      <SelectItem key={id} value={id} className="text-sm">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showExecutor && (
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Исполнитель</span>
                  <Select value={f.executor} onValueChange={(v) => set("executor", v)}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все исполнители
                      </SelectItem>
                      <SelectItem value={NOBODY} className="text-sm">
                        Не назначен
                      </SelectItem>
                      {executors.map(([id, name]) => (
                        <SelectItem key={id} value={id} className="text-sm">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Просроченные</span>
                <Switch checked={f.onlyOverdue} onCheckedChange={(v) => set("onlyOverdue", v)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Незакрытые</span>
                <Switch checked={f.onlyOpen} onCheckedChange={(v) => set("onlyOpen", v)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Исключённые</span>
                <Switch checked={f.showExcluded} onCheckedChange={(v) => set("showExcluded", v)} />
              </label>
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
      {toolbar ? <div className="flex shrink-0 gap-2">{toolbar(visible)}</div> : null}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {chromeHost
        ? createPortal(chrome, chromeHost)
        : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {chrome}
          </div>
        )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!hasOpenRows && (f.onlyOpen || closedSorted.length === 0) ? (
          <div className="rounded-md border border-border bg-card py-10 text-center text-sm text-muted-foreground">
            {stages.length === 0 ? "На объекте нет этапов" : "Нет этапов по выбранным условиям"}
          </div>
        ) : (
          /* Одна обёртка: sticky-шапка живёт до конца скролла, в т.ч. по «Закрытым» */
          <div className="space-y-3 pb-1" style={{ minWidth: colsTotal }}>
            <div className="sticky top-0 z-20 overflow-hidden rounded-md border border-border bg-muted/30 backdrop-blur-sm">
              <table className="w-full table-fixed text-sm" style={{ minWidth: colsTotal }}>
                <TableColgroup columns={columns} widths={colWidths} />
                <StagesHead
                  showExecutor={showExecutor}
                  sort={sort}
                  onToggle={toggle}
                  resizeProps={resizeProps}
                />
              </table>
            </div>

            {view === "groups" ? (
              groups.map((g) => (
                <section key={g.id} className="overflow-hidden rounded-md border border-border bg-card">
                  <header className="border-b border-border/80 bg-muted/40 px-4 py-2">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {g.name}
                    </h3>
                  </header>
                  <table className="w-full table-fixed text-sm" style={{ minWidth: colsTotal }}>
                    <TableColgroup columns={columns} widths={colWidths} />
                    <tbody>
                      {g.rows.map((s) => (
                        <StageRow key={s.id} s={s} showExecutor={showExecutor} {...rowProps} />
                      ))}
                    </tbody>
                  </table>
                </section>
              ))
            ) : openFlat.length > 0 ? (
              <section className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full table-fixed text-sm" style={{ minWidth: colsTotal }}>
                  <TableColgroup columns={columns} widths={colWidths} />
                  <tbody>
                    {openFlat.map((s) => (
                      <StageRow key={s.id} s={s} showExecutor={showExecutor} {...rowProps} />
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {!f.onlyOpen && closedSorted.length > 0 && (
              <div className="rounded-md border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setClosedOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  {closedOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Закрытые
                  <span className="tabular-nums">{closedSorted.length}</span>
                </button>
                {closedOpen && (
                  <table
                    className="w-full table-fixed border-t border-border text-sm"
                    style={{ minWidth: colsTotal }}
                  >
                    <TableColgroup columns={columns} widths={colWidths} />
                    <tbody>
                      {closedSorted.map((s) => (
                        <StageRow key={s.id} s={s} showExecutor={showExecutor} {...rowProps} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StagesTableSkeleton({
  showExecutor,
  columns,
  widths,
  totalWidth,
  groups = 2,
  rows = 5,
}: {
  showExecutor: boolean;
  columns: ColumnWidthDef[];
  widths: ColumnWidths;
  totalWidth: number;
  groups?: number;
  rows?: number;
}) {
  const td = "px-5 py-2.5 align-middle";
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="space-y-3 pb-1" style={{ minWidth: totalWidth }}>
        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          <table className="w-full table-fixed text-sm" style={{ minWidth: totalWidth }}>
            <TableColgroup columns={columns} widths={widths} />
            <thead>
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">N</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">Этап</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">Условия</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">Срок</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">Статус</th>
                {showExecutor && (
                  <th className="px-5 py-2.5 pr-6 text-left text-xs font-medium text-muted-foreground">Исполнитель</th>
                )}
                <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">Адресат</th>
              </tr>
            </thead>
          </table>
        </div>
        {Array.from({ length: groups }, (_, g) => (
          <section key={g} className="overflow-hidden rounded-md border border-border bg-card">
            <header className="border-b border-border/80 bg-muted/40 px-4 py-2">
              <Skeleton height={16} width={`${38 + g * 10}%`} />
            </header>
            <table className="w-full table-fixed text-sm" style={{ minWidth: totalWidth }}>
              <TableColgroup columns={columns} widths={widths} />
              <tbody>
                {Array.from({ length: rows }, (_, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className={td}>
                      <Skeleton height={16} width={28} />
                    </td>
                    <td className={td}>
                      <Skeleton height={16} width={`${55 + ((i + g) % 4) * 8}%`} />
                    </td>
                    <td className={td}>
                      <Skeleton height={14} width={72} />
                    </td>
                    <td className={td}>
                      <Skeleton height={16} width={88} />
                    </td>
                    <td className={td}>
                      <Skeleton height={22} width={96} borderRadius={6} />
                    </td>
                    {showExecutor && (
                      <td className={cn(td, "pr-6")}>
                        <Skeleton height={16} width="70%" />
                      </td>
                    )}
                    <td className={td}>
                      <Skeleton height={16} width="65%" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

function StagesHead({
  showExecutor,
  sort,
  onToggle,
  resizeProps,
}: {
  showExecutor: boolean;
  sort: SortState<StageSort> | null;
  onToggle: (key: StageSort) => void;
  resizeProps: (columnId: string) => ThResizeProps;
}) {
  /** Без border-b — иначе с рамкой sticky-шапки получается толстая двойная линия. */
  const th = "border-b-0 bg-transparent";
  return (
    <thead>
      <tr>
        <SortableTh column="number" sort={sort} onToggle={onToggle} className={th} resize={resizeProps("number")}>
          N
        </SortableTh>
        <SortableTh column="name" sort={sort} onToggle={onToggle} className={th} resize={resizeProps("name")}>
          Этап
        </SortableTh>
        <SortableTh
          column="conditions"
          sort={sort}
          onToggle={onToggle}
          className={th}
          resize={resizeProps("conditions")}
        >
          Условия
        </SortableTh>
        <SortableTh column="due" sort={sort} onToggle={onToggle} className={th} resize={resizeProps("due")}>
          Срок
        </SortableTh>
        <SortableTh column="status" sort={sort} onToggle={onToggle} className={th} resize={resizeProps("status")}>
          Статус
        </SortableTh>
        {showExecutor && (
          <SortableTh
            column="executor"
            sort={sort}
            onToggle={onToggle}
            className={cn(th, "pr-6")}
            resize={resizeProps("executor")}
          >
            Исполнитель
          </SortableTh>
        )}
        <SortableTh
          column="confirmer"
          sort={sort}
          onToggle={onToggle}
          className={th}
          resize={resizeProps("confirmer")}
        >
          Адресат
        </SortableTh>
      </tr>
    </thead>
  );
}

function StageRow({
  s,
  objectId,
  condByStage,
  preds,
  codeById,
  onChanged,
  showExecutor,
  showGroup,
}: {
  s: ObjectStage;
  objectId: string;
  condByStage: Record<string, StageCondition[]>;
  preds: Record<string, string[]>;
  codeById: Record<string, string>;
  onChanged: () => void;
  showExecutor: boolean;
  showGroup?: boolean;
}) {
  const conds = condByStage[s.id] ?? [];
  const predNumbers = (preds[s.id] ?? [])
    .map((id) => codeById[id])
    .filter((x): x is string => !!x)
    .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  const noResponseDays = s.is_no_response && s.response_due ? daysBetween(s.response_due, mskToday()) : 0;
  const link = { to: "/objects/$id/stages/$stageId" as const, params: { id: objectId, stageId: s.id } };
  const docsHint = [s.outgoing_doc && `от нас: ${s.outgoing_doc}`, s.expected_doc && `ждём: ${s.expected_doc}`]
    .filter(Boolean)
    .join(" · ");
  const groupName = s.work_type_name?.trim() || "Без группы";
  /** top + py: при раскрытых условиях соседние ячейки не «висят» по центру пустоты */
  const td = "px-5 py-2.5 align-top";
  const isSub = !!s.parent_id;

  return (
    <tr className={cn("group border-t border-border/50", rowTone(s))}>
      <td className={td}>
        <Link
          {...link}
          className={cn(
            "inline-flex h-7 items-center gap-1 tabular-nums leading-none text-muted-foreground hover:text-primary",
            isSub && "pl-3",
          )}
        >
          {s.code || s.number}
          {s.is_critical && <Flag className="size-3 fill-destructive text-destructive" aria-label="Критичный" />}
        </Link>
      </td>
      <td className={td}>
        <div className={cn("min-w-0 space-y-1", isSub && "pl-3")}>
          <div className="flex min-h-7 min-w-0 items-center gap-2">
            <Link {...link} className="min-w-0 flex-1 truncate font-medium hover:underline" title={docsHint || s.name}>
              {s.name}
            </Link>
            {s.out_of_order && (
              <span
                title={`Взят вне очереди: по регламенту после этапов ${predNumbers.join(", ") || "—"}`}
                className="inline-flex shrink-0 items-center text-[11px] text-warning"
              >
                <AlertTriangle className="size-3" />
              </span>
            )}
            {s.is_excluded && <span className="shrink-0 text-[11px] text-muted-foreground">искл.</span>}
          </div>
          {showGroup && (
            <span
              className="inline-flex max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground"
              title={groupName}
            >
              {groupName}
            </span>
          )}
        </div>
      </td>
      <td className={td}>
        <ConditionsCell conds={conds} done={s.conditions_done} total={s.conditions_total} disabled={s.is_excluded} onDone={onChanged} />
      </td>
      <td className={td}>
        <span
          className={cn(
            "inline-flex h-7 items-center tabular-nums",
            (s.is_overdue || s.is_no_response) && "font-medium text-danger",
          )}
          title={
            s.is_no_response ? `Нет ответа ${noResponseDays} дн.` : undefined
          }
        >
          {formatDate(s.due_date) || <span className="text-muted-foreground">—</span>}
        </span>
      </td>
      <td className={td}>
        <div className="flex h-7 items-center">
          <StatusBadge name={s.status_name} color={s.status_color} className="max-w-[10.5rem]" />
        </div>
      </td>
      {showExecutor && (
        <td className={cn(td, "overflow-hidden pr-6")}>
          <div className="flex h-7 items-center overflow-hidden">
            {s.executor_name ? (
              <span className="block truncate" title={s.executor_name}>
                {s.executor_name}
              </span>
            ) : (
              <span className={s.is_closed || s.is_excluded ? "text-muted-foreground" : "text-warning"}>
                не назначен
              </span>
            )}
          </div>
        </td>
      )}
      <td className={cn(td, "overflow-hidden pl-1 text-muted-foreground")}>
        <div
          className="flex h-7 items-center truncate"
          title={s.confirmer_name ?? s.confirmer_role_name ?? undefined}
        >
          {s.confirmer_name ?? s.confirmer_role_name ?? "—"}
        </div>
      </td>
    </tr>
  );
}

/** Прогресс условий свёрнут; чеклист раскрывается по клику — строки таблицы остаются ровными. */
function ConditionsCell({
  conds,
  done,
  total,
  disabled,
  onDone,
}: {
  conds: StageCondition[];
  done: number;
  total: number;
  disabled?: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (conds.length === 0) return <span className="text-muted-foreground">—</span>;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-0.5 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className={`shrink-0 tabular-nums text-xs font-medium leading-none ${complete ? "text-success" : ""}`}>
          {done}/{total}
        </span>
        <span className="inline-block h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full ${complete ? "bg-success" : "bg-primary/70"}`}
            style={{ width: `${pct}%` }}
          />
        </span>
      </button>
      {open && (
        <ul className="mt-2 max-w-none space-y-1.5 border-l border-border/60 pb-1 pl-3 ml-1.5">
          {conds.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 whitespace-nowrap text-xs leading-5">
              <span className="mt-0.5 inline-flex shrink-0">
                <ConditionToggle cond={c} size="sm" disabled={!!disabled} onDone={onDone} />
              </span>
              <span className={c.is_done ? "text-muted-foreground line-through" : "text-foreground/90"}>
                {c.title}
                {c.kind === "field" && c.value_text && <span className="no-underline"> — {c.value_text}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

