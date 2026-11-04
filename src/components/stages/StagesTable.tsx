import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { formatDate } from "@/lib/format";
import { daysBetween, mskToday } from "@/lib/dates";
import { sortRows, useTableSort, type SortState } from "@/lib/table-sort";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { SortableTh } from "@/components/SortableTh";
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

type StageSort = "number" | "name" | "conditions" | "due" | "status" | "executor" | "confirmer";

const STAGE_GETTERS: Record<StageSort, (s: ObjectStage) => unknown> = {
  number: (s) => s.number,
  name: (s) => s.name,
  conditions: (s) => (s.conditions_total ? s.conditions_done / s.conditions_total : -1),
  due: (s) => s.due_date,
  status: (s) => s.status_name,
  executor: (s) => s.executor_name,
  confirmer: (s) => s.confirmer_name ?? s.confirmer_role_name,
};


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
}: {
  objectId: string;
  /** Дополнительные кнопки панели (Excel, печать) получают видимые строки. */
  toolbar?: (visible: ObjectStage[]) => ReactNode;
}) {
  const { role_code, is_admin } = useProfile();
  const showExecutor = is_admin || role_code !== "foreman";
  const { data: stages = [], isLoading } = useObjectStages(objectId);
  const ids = stages.map((s) => s.id);
  const { data: conditions = [] } = useObjectConditions(objectId, ids);
  const { data: preds = {} } = useObjectPredecessors(objectId, ids);
  const refresh = useRefreshStages();

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
  const numberById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s.number])), [stages]);

  const visible = filterStages(stages, f);
  const open = visible.filter((s) => !s.is_closed);
  const closed = visible.filter((s) => s.is_closed);

  // Группы по видам работ
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
      .map((g) => ({
        ...g,
        rows: sortRows(
          open.filter((s) => (s.work_type_id ?? "") === g.id),
          sort,
          STAGE_GETTERS,
        ),
      }))
      .filter((g) => g.rows.length > 0);
  }, [stages, open, sort]);

  const closedSorted = useMemo(() => sortRows(closed, sort, STAGE_GETTERS), [closed, sort]);

  if (isLoading) return <p className="py-4 text-sm text-muted-foreground">Загрузка…</p>;

  const set = <K extends keyof StagesTableFilters>(k: K, v: StagesTableFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const onChanged = () => refresh(objectId);
  const rowProps = { objectId, condByStage, preds, numberById, onChanged };

  return (
    <div>
      <div className="mb-4 flex flex-nowrap items-center gap-x-3 gap-y-2 overflow-x-auto">
        <Select value={f.workType} onValueChange={(v) => set("workType", v)}>
          <SelectTrigger className="h-9 w-40 shrink-0 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">Все группы</SelectItem>
            {workTypes.map(([id, name]) => (
              <SelectItem key={id} value={id} className="text-sm">{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showExecutor && (
          <Select value={f.executor} onValueChange={(v) => set("executor", v)}>
            <SelectTrigger className="h-9 w-40 shrink-0 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-sm">Все исполнители</SelectItem>
              <SelectItem value={NOBODY} className="text-sm">Не назначен</SelectItem>
              {executors.map(([id, name]) => (
                <SelectItem key={id} value={id} className="text-sm">{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
          <Switch checked={f.onlyOverdue} onCheckedChange={(v) => set("onlyOverdue", v)} /> Просроченные
        </label>
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
          <Switch checked={f.onlyOpen} onCheckedChange={(v) => set("onlyOpen", v)} /> Незакрытые
        </label>
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
          <Switch checked={f.showExcluded} onCheckedChange={(v) => set("showExcluded", v)} /> Исключённые
        </label>
        {toolbar && <div className="ml-auto flex shrink-0 gap-2">{toolbar(visible)}</div>}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          {stages.length === 0 ? "На объекте нет этапов" : "Нет этапов по выбранным условиям"}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <div className="min-w-[1020px]">
            {/* Одна общая шапка колонок */}
            <div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border bg-muted/30 backdrop-blur-sm">
              <table className="w-full table-fixed text-sm">
                <StagesColgroup showExecutor={showExecutor} />
                <StagesHead showExecutor={showExecutor} sort={sort} onToggle={toggle} />
              </table>
            </div>

            <div className="space-y-3 pt-3">
              {groups.map((g) => (
                <section
                  key={g.id}
                  className="overflow-hidden rounded-xl border border-border"
                >
                  <header className="border-b border-border/80 bg-muted/40 px-4 py-2.5">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{g.name}</h3>
                  </header>
                  <table className="w-full table-fixed text-sm">
                    <StagesColgroup showExecutor={showExecutor} />
                    <tbody>
                      {g.rows.map((s) => (
                        <StageRow key={s.id} s={s} showExecutor={showExecutor} {...rowProps} />
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {!f.onlyOpen && closedSorted.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card">
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
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[1020px] table-fixed text-sm">
                <StagesColgroup showExecutor={showExecutor} />
                <StagesHead showExecutor={showExecutor} sort={sort} onToggle={toggle} />
                <tbody>
                  {closedSorted.map((s) => (
                    <StageRow key={s.id} s={s} showExecutor={showExecutor} {...rowProps} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StagesColgroup({ showExecutor }: { showExecutor: boolean }) {
  return (
    <colgroup>
      <col className="w-12" />
      <col className="w-[22%]" />
      <col className="w-28" />
      <col className="w-32" />
      <col className="w-[11.5rem]" />
      {showExecutor && <col className="w-56" />}
      <col className="w-36" />
    </colgroup>
  );
}

function StagesHead({
  showExecutor,
  sort,
  onToggle,
}: {
  showExecutor: boolean;
  sort: SortState<StageSort> | null;
  onToggle: (key: StageSort) => void;
}) {
  /** Без border-b — иначе с рамкой sticky-шапки получается толстая двойная линия. */
  const th = "border-b-0 bg-transparent";
  return (
    <thead>
      <tr>
        <SortableTh column="number" sort={sort} onToggle={onToggle} className={th}>N</SortableTh>
        <SortableTh column="name" sort={sort} onToggle={onToggle} className={th}>Этап</SortableTh>
        <SortableTh column="conditions" sort={sort} onToggle={onToggle} className={th}>Условия</SortableTh>
        <SortableTh column="due" sort={sort} onToggle={onToggle} className={th}>Срок</SortableTh>
        <SortableTh column="status" sort={sort} onToggle={onToggle} className={th}>Статус</SortableTh>
        {showExecutor && (
          <SortableTh column="executor" sort={sort} onToggle={onToggle} className={cn(th, "pr-6")}>
            Исполнитель
          </SortableTh>
        )}
        <SortableTh column="confirmer" sort={sort} onToggle={onToggle} className={th}>
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
  numberById,
  onChanged,
  showExecutor,
}: {
  s: ObjectStage;
  objectId: string;
  condByStage: Record<string, StageCondition[]>;
  preds: Record<string, string[]>;
  numberById: Record<string, number>;
  onChanged: () => void;
  showExecutor: boolean;
}) {
  const conds = condByStage[s.id] ?? [];
  const predNumbers = (preds[s.id] ?? []).map((id) => numberById[id]).filter((x) => x !== undefined).sort((a, b) => a - b);
  const noResponseDays = s.is_no_response && s.response_due ? daysBetween(s.response_due, mskToday()) : 0;
  const link = { to: "/objects/$id/stages/$stageId" as const, params: { id: objectId, stageId: s.id } };
  const docsHint = [s.outgoing_doc && `от нас: ${s.outgoing_doc}`, s.expected_doc && `ждём: ${s.expected_doc}`]
    .filter(Boolean)
    .join(" · ");
  const td = "h-11 px-5 py-0 align-middle";

  return (
    <tr className={cn("group border-t border-border/50", rowTone(s))}>
      <td className={td}>
        <Link {...link} className="inline-flex items-center gap-1 tabular-nums leading-none text-muted-foreground hover:text-primary">
          {s.number}
          {s.is_critical && <Flag className="size-3 fill-destructive text-destructive" aria-label="Критичный" />}
        </Link>
      </td>
      <td className={td}>
        <div className="flex min-w-0 items-center gap-2">
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
      </td>
      <td className={td}>
        <ConditionsCell conds={conds} done={s.conditions_done} total={s.conditions_total} disabled={s.is_excluded} onDone={onChanged} />
      </td>
      <td className={td}>
        <span
          className={cn(
            "tabular-nums",
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
        <StatusBadge name={s.status_name} color={s.status_color} className="max-w-[10.5rem]" />
      </td>
      {showExecutor && (
        <td className={cn(td, "overflow-hidden pr-6")}>
          {s.executor_name ? (
            <span className="block truncate" title={s.executor_name}>
              {s.executor_name}
            </span>
          ) : (
            <span className={s.is_closed || s.is_excluded ? "text-muted-foreground" : "text-warning"}>
              не назначен
            </span>
          )}
        </td>
      )}
      <td className={cn(td, "overflow-hidden pl-1 text-muted-foreground")}>
        <div
          className="truncate"
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
        <ul className="mt-1.5 space-y-1 border-l border-border/70 pl-2">
          {conds.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs leading-snug">
              <ConditionToggle cond={c} size="sm" disabled={!!disabled} onDone={onDone} />
              <span className={c.is_done ? "text-muted-foreground line-through" : ""}>
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

