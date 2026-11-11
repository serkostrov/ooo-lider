import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, LayoutList, ListFilter, Plus, X } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { formatDate } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toolbar, matches } from "@/components/directories/common";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { SortableTh } from "@/components/SortableTh";
import {
  OBJECT_STATUSES,
  contractTone,
  daysLeftText,
  statusLabel,
  useObjectTypes,
  useObjects,
  type ObjectRow,
} from "@/components/objects/data";

type ViewMode = "table" | "cards";
const VIEW_KEY = "lider.objects.view";

function useObjectsView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "cards") return saved;
    } catch {
      /* ignore */
    }
    return "cards";
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* ignore */
      }
    },
  ];
}

type ObjSort =
  | "name"
  | "address"
  | "customer"
  | "type"
  | "responsible"
  | "stage"
  | "progress"
  | "contract";

type ProblemFilter =
  | "all"
  | "stages_overdue"
  | "stages_no_response"
  | "stages_on_review"
  | "stages_no_executor"
  | "requests_new"
  | "requests_overdue";

type ProblemTone = "danger" | "warn" | "signal";

const OBJ_GETTERS: Record<ObjSort, (o: ObjectRow) => unknown> = {
  name: (o) => o.name,
  address: (o) => o.address,
  customer: (o) => o.customer_name,
  type: (o) => o.object_type,
  responsible: (o) => o.responsible_name,
  stage: (o) => o.current_stage_number ?? 0,
  progress: (o) => o.progress_pct,
  contract: (o) => o.contract_end,
};

const PROBLEM_MATCH: Record<Exclude<ProblemFilter, "all">, (o: ObjectRow) => boolean> = {
  stages_overdue: (o) => o.stages_overdue > 0,
  stages_no_response: (o) => o.stages_no_response > 0,
  stages_on_review: (o) => o.stages_on_review > 0,
  stages_no_executor: (o) => o.stages_no_executor > 0,
  requests_new: (o) => o.requests_new > 0,
  requests_overdue: (o) => o.requests_overdue > 0,
};

const PROBLEM_META: Record<
  Exclude<ProblemFilter, "all">,
  { short: string; tone: ProblemTone; count: (o: ObjectRow) => number }
> = {
  stages_overdue: { short: "просроч. этапов", tone: "danger", count: (o) => o.stages_overdue },
  stages_no_response: { short: "без ответа", tone: "danger", count: (o) => o.stages_no_response },
  stages_on_review: { short: "на проверке", tone: "warn", count: (o) => o.stages_on_review },
  stages_no_executor: { short: "без исполнителя", tone: "warn", count: (o) => o.stages_no_executor },
  requests_new: { short: "новых заявок", tone: "signal", count: (o) => o.requests_new },
  requests_overdue: { short: "просроч. заявок", tone: "danger", count: (o) => o.requests_overdue },
};

export const Route = createFileRoute("/_authenticated/objects")({
  component: ObjectsPage,
  head: () => ({
    meta: [
      { title: "Объекты — Лидер" },
      { name: "description", content: "Объекты в системе «Лидер»" },
    ],
  }),
});

function ObjectsPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const { data: objects = [], isLoading } = useObjects();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const { all: objectTypes } = useObjectTypes();
  const typeOptions = objectTypes.filter(
    (t) => !t.deleted_at || objects.some((o) => o.object_type === t.code),
  );
  const [archive, setArchive] = useState(false);
  const [problem, setProblem] = useState<ProblemFilter>("all");
  const [view, setView] = useObjectsView();

  const activeFilterCount =
    (status !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0) + (archive ? 1 : 0);

  const resetFilters = () => {
    setStatus("all");
    setType("all");
    setArchive(false);
  };

  const scope = useMemo(
    () => objects.filter((o) => (archive ? o.status === "completed" : o.status !== "completed")),
    [objects, archive],
  );

  const summary = useMemo(() => {
    const sum = (pick: (o: ObjectRow) => number) => scope.reduce((a, o) => a + pick(o), 0);
    return {
      stages_overdue: sum((o) => o.stages_overdue),
      stages_no_response: sum((o) => o.stages_no_response),
      stages_on_review: sum((o) => o.stages_on_review),
      stages_no_executor: sum((o) => o.stages_no_executor),
      requests_new: sum((o) => o.requests_new),
      requests_overdue: sum((o) => o.requests_overdue),
    };
  }, [scope]);

  const filtered = useMemo(
    () =>
      scope.filter(
        (o) =>
          matches(search, o.name, o.address) &&
          (status === "all" || o.status === status) &&
          (type === "all" || o.object_type === type) &&
          (problem === "all" || PROBLEM_MATCH[problem](o)),
      ),
    [scope, search, status, type, problem],
  );

  /** При выбранной проблеме — сначала объекты с большим числом попаданий. */
  const filteredRanked = useMemo(() => {
    if (problem === "all") return filtered;
    const count = PROBLEM_META[problem].count;
    return [...filtered].sort(
      (a, b) => count(b) - count(a) || a.name.localeCompare(b.name, "ru"),
    );
  }, [filtered, problem]);

  const problemTotal =
    problem === "all" ? 0 : filteredRanked.reduce((s, o) => s + PROBLEM_META[problem].count(o), 0);

  const { sort, toggle } = useTableSort<ObjSort>();
  const rows = useSortedRows(filteredRanked, sort, OBJ_GETTERS);

  return (
    <PageFrame
      header={
        <>
      <PageHeader
        title={archive ? "Архив объектов" : "Объекты"}
        description={
          archive
            ? "Завершённые объекты в архиве"
            : problem === "all"
              ? "Список всех активных объектов"
              : `${filteredRanked.length} ${objectsWord(filteredRanked.length)} · ${problemTotal} ${PROBLEM_META[problem].short}`
        }
        className="mb-3"
        actions={
          is_admin ? (
            <Button
              onClick={() => navigate({ to: "/objects/new" })}
              className="h-9 gap-2 px-3 text-sm"
            >
              <Plus className="size-4" />
              Создать объект
            </Button>
          ) : undefined
        }
      />

      {!archive && (
        <div className="mb-3 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)]">
          {isLoading ? (
            <ProblemsSkeleton />
          ) : (
            <div className="grid divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <ProblemGroup
                label="Этапы"
                problem={problem}
                onSelect={setProblem}
                items={[
                  ["stages_overdue", "Просрочено", summary.stages_overdue, "danger"],
                  ["stages_no_response", "Нет ответа", summary.stages_no_response, "danger"],
                  ["stages_on_review", "На проверке", summary.stages_on_review, "warn"],
                  ["stages_no_executor", "Без исполнителя", summary.stages_no_executor, "warn"],
                ]}
              />
              <ProblemGroup
                label="Заявки"
                problem={problem}
                onSelect={setProblem}
                items={[
                  ["requests_new", "Новые", summary.requests_new, "signal"],
                  ["requests_overdue", "Просрочено", summary.requests_overdue, "danger"],
                ]}
              />
            </div>
          )}
        </div>
      )}

      <Toolbar search={search} onSearch={setSearch} className="mb-0">
        <div
          className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Вид списка"
        >
          <button
            type="button"
            title="Таблица"
            aria-label="Таблица"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
            className={cn(
              "inline-flex w-9 items-center justify-center transition-colors",
              view === "table"
                ? "bg-primary/14 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <LayoutList className="size-4" />
          </button>
          <button
            type="button"
            title="Карточки"
            aria-label="Карточки"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
            className={cn(
              "inline-flex w-9 items-center justify-center border-l border-border transition-colors",
              view === "cards"
                ? "bg-primary/14 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
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
            <PopoverContent align="start" className="w-[min(100vw-2rem,20rem)] p-0">
              <div className="space-y-3 p-4">
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Статус</span>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        Все статусы
                      </SelectItem>
                      {OBJECT_STATUSES.filter((s) =>
                        archive ? s.v === "completed" : s.v !== "completed",
                      ).map((s) => (
                        <SelectItem key={s.v} value={s.v} className="text-sm">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Тип</span>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">
                        Все типы
                      </SelectItem>
                      {typeOptions.map((t) => (
                        <SelectItem key={t.code} value={t.code} className="text-sm">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Архив</span>
                  <Switch
                    checked={archive}
                    onCheckedChange={(v) => {
                      setArchive(v);
                      setStatus("all");
                    }}
                  />
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
      </Toolbar>
        </>
      }
    >
      {view === "table" ? (
        <div className="max-h-full min-h-0 overflow-auto rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)] backdrop-blur-[2px]">
          <Table className="w-full table-fixed text-sm" containerClassName="max-h-none overflow-visible">
            <TableHeader>
              <TableRow>
                <SortableTh as="table" column="name" sort={sort} onToggle={toggle} className="w-[24%]">
                  Наименование
                </SortableTh>
                <SortableTh as="table" column="address" sort={sort} onToggle={toggle} className="w-[16%]">
                  Адрес
                </SortableTh>
                <SortableTh as="table" column="customer" sort={sort} onToggle={toggle} className="w-[14%]">
                  Заказчик
                </SortableTh>
                <SortableTh as="table" column="type" sort={sort} onToggle={toggle} className="w-[8%]">
                  Тип
                </SortableTh>
                <SortableTh as="table" column="responsible" sort={sort} onToggle={toggle} className="w-[12%]">
                  Ответственный
                </SortableTh>
                <SortableTh as="table" column="stage" sort={sort} onToggle={toggle} className="w-[14%]">
                  Текущий этап
                </SortableTh>
                <SortableTh as="table" column="progress" sort={sort} onToggle={toggle} className="w-[10%]">
                  Готовность
                </SortableTh>
                <SortableTh as="table" column="contract" sort={sort} onToggle={toggle} className="w-[10%]">
                  Окончание
                </SortableTh>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <ObjectsTableSkeleton rows={8} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    <EmptyObjectsMessage empty={objects.length === 0} isAdmin={is_admin} />
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <ObjectTableRow
                    key={o.id}
                    o={o}
                    problem={problem}
                    onOpen={() => navigate({ to: "/objects/$id", params: { id: o.id } })}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="max-h-full min-h-0 overflow-auto">
          {isLoading ? (
            <ObjectsCardsSkeleton />
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-card py-12 text-center text-sm text-muted-foreground shadow-[var(--surface-glow)]">
              <EmptyObjectsMessage empty={objects.length === 0} isAdmin={is_admin} />
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((o) => (
                <ObjectCard
                  key={o.id}
                  o={o}
                  problem={problem}
                  onOpen={() => navigate({ to: "/objects/$id", params: { id: o.id } })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageFrame>
  );
}

function objectsWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "объект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "объекта";
  return "объектов";
}

const td = "max-w-0 px-5 py-3";

function ProblemsSkeleton() {
  return (
    <div className="grid divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
      {[4, 2].map((count, gi) => (
        <div key={gi} className="min-w-0 p-2.5 sm:p-3">
          <Skeleton height={12} width={56} className="mb-2 ml-1" />
          <div
            className={cn(
              "grid gap-1",
              count <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
            )}
          >
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg px-2.5 py-2">
                <Skeleton height={24} width={32} />
                <Skeleton height={12} width={64} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ObjectsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell className={td}>
            <Skeleton height={16} width="85%" />
            <Skeleton height={12} width={64} className="mt-1.5" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width="90%" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width="70%" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width={48} />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width="75%" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width="80%" />
            <Skeleton height={12} width={80} className="mt-1.5" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={12} width={64} />
            <Skeleton height={6} width="100%" borderRadius={999} className="mt-2" />
          </TableCell>
          <TableCell className={td}>
            <Skeleton height={16} width={80} />
            <Skeleton height={12} width={40} className="mt-1.5" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ObjectsCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3.5 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--surface-glow)]"
        >
          <div className="space-y-2 pl-1">
            <Skeleton height={16} width="90%" />
            <Skeleton height={12} width="70%" />
            <Skeleton height={20} width={56} />
          </div>
          <div className="grid grid-cols-2 gap-3 pl-1">
            <div className="space-y-1.5">
              <Skeleton height={10} width={56} />
              <Skeleton height={14} width="80%" />
            </div>
            <div className="space-y-1.5">
              <Skeleton height={10} width={80} />
              <Skeleton height={14} width="70%" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Skeleton height={10} width={64} />
              <Skeleton height={14} width="85%" />
            </div>
          </div>
          <div className="mt-auto space-y-2 border-t border-border/55 pt-3 pl-1">
            <div className="flex justify-between">
              <Skeleton height={10} width={64} />
              <Skeleton height={10} width={80} />
            </div>
            <Skeleton height={6} width="100%" borderRadius={999} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProblemHit({
  problem,
  o,
  className,
}: {
  problem: Exclude<ProblemFilter, "all">;
  o: ObjectRow;
  className?: string;
}) {
  const meta = PROBLEM_META[problem];
  const n = meta.count(o);
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium leading-none",
        meta.tone === "danger" && "bg-danger-soft text-danger",
        meta.tone === "warn" && "bg-warning-soft text-warning",
        meta.tone === "signal" && "bg-info-soft text-info",
        className,
      )}
    >
      <span className="font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums">
        {n}
      </span>
      {meta.short}
    </span>
  );
}

function EmptyObjectsMessage({ empty, isAdmin }: { empty: boolean; isAdmin: boolean }) {
  if (!empty) return <>Ничего не найдено</>;
  return (
    <>
      {isAdmin
        ? "Объектов пока нет. Нажмите «Создать объект»."
        : "Вы пока не участник ни одного объекта"}
    </>
  );
}

type ProblemItem = readonly [Exclude<ProblemFilter, "all">, string, number, ProblemTone];

function ProblemGroup({
  label,
  items,
  problem,
  onSelect,
}: {
  label: string;
  items: readonly ProblemItem[];
  problem: ProblemFilter;
  onSelect: (v: ProblemFilter) => void;
}) {
  return (
    <div className="min-w-0 p-2.5 sm:p-3">
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "grid gap-1",
          items.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {items.map(([key, itemLabel, value, tone]) => {
          const active = problem === key;
          const hot = value > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(active ? "all" : key)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                active
                  ? "bg-primary/12 ring-1 ring-primary/30"
                  : "hover:bg-elevated/80",
              )}
            >
              <span
                className={cn(
                  "font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums leading-none tracking-tight",
                  hot && tone === "danger" && "text-danger",
                  hot && tone === "warn" && "text-warning",
                  hot && tone === "signal" && "text-info",
                  !hot && "text-muted-foreground",
                  active && !hot && "text-foreground",
                )}
              >
                {value}
              </span>
              <span
                className={cn(
                  "truncate text-[12px] leading-tight",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {itemLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ObjectCard({
  o,
  problem,
  onOpen,
}: {
  o: ObjectRow;
  problem: ProblemFilter;
  onOpen: () => void;
}) {
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const alerts =
    problem === "all"
      ? ([
          o.stages_overdue > 0 ? `Этапы −${o.stages_overdue}` : null,
          o.stages_no_response > 0 ? `Нет ответа ${o.stages_no_response}` : null,
          o.requests_overdue > 0 ? `Заявки −${o.requests_overdue}` : null,
          o.requests_new > 0 ? `Новые ${o.requests_new}` : null,
        ].filter(Boolean) as string[])
      : [];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card p-4 text-left shadow-[var(--surface-glow)] backdrop-blur-[2px] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--surface-glow-hover)]"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] transition-colors",
          problem !== "all"
            ? PROBLEM_META[problem].tone === "danger"
              ? "bg-danger"
              : PROBLEM_META[problem].tone === "warn"
                ? "bg-warning"
                : "bg-info"
            : tone === "bad"
              ? "bg-danger"
              : tone === "warn"
                ? "bg-warning"
                : "bg-primary/55 group-hover:bg-primary",
        )}
      />
      <div className="flex flex-1 flex-col gap-3.5 pl-1">
        <div className="min-w-0 space-y-1.5">
          <div className="font-[family-name:var(--font-display)] text-[0.95rem] font-semibold leading-snug tracking-tight text-foreground">
            {o.name}
          </div>
          {o.address && (
            <div className="line-clamp-2 text-sm leading-snug text-muted-foreground">{o.address}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info">
              {typeLabel(o.object_type)}
            </span>
            {o.status !== "in_work" && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {statusLabel(o.status)}
              </span>
            )}
            {problem !== "all" && <ProblemHit problem={problem} o={o} />}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Заказчик</dt>
            <dd className="truncate font-medium">{o.customer_name || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ответственный</dt>
            <dd className="truncate font-medium">{o.responsible_name || "—"}</dd>
          </div>
          <div className="min-w-0 col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Текущий этап</dt>
            <dd className="truncate">
              {o.current_stage_number != null ? (
                <>
                  <span className="font-[family-name:var(--font-display)] font-semibold tabular-nums text-primary">
                    {o.current_stage_number}.
                  </span>{" "}
                  {o.current_stage_name}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div className="min-w-0 col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Окончание договора
            </dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                tone === "bad" && "text-danger",
                tone === "warn" && "text-warning",
              )}
            >
              {formatDate(o.contract_end) || "—"}
              {o.status !== "completed" && o.contract_days_left !== null && (
                <span className="ml-1.5 text-xs font-normal opacity-80">
                  {daysLeftText(o.contract_days_left)}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-auto space-y-2 border-t border-border/55 pt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wide">Готовность</span>
            <span className="tabular-nums">
              <span className="font-[family-name:var(--font-display)] font-semibold text-foreground">
                {o.progress_pct}%
              </span>
              {" · "}
              {o.stages_closed} из {o.stages_total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-500 group-hover:bg-primary"
              style={{ width: `${o.progress_pct}%` }}
            />
          </div>
          {alerts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {alerts.map((a) => (
                <span
                  key={a}
                  className="rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ObjectTableRow({
  o,
  problem,
  onOpen,
}: {
  o: ObjectRow;
  problem: ProblemFilter;
  onOpen: () => void;
}) {
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const contractTitle = [
    o.contract_start ? `с ${formatDate(o.contract_start)}` : null,
    o.contract_end ? `по ${formatDate(o.contract_end)}` : null,
    o.status !== "completed" && o.contract_days_left !== null
      ? o.contract_days_left < 0
        ? `Просрочен на ${-o.contract_days_left} дн.`
        : o.contract_days_left === 0
          ? "Истекает сегодня"
          : `Осталось ${o.contract_days_left} дн.`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableRow className="cursor-pointer transition-colors hover:bg-elevated/60" onClick={onOpen}>
      <TableCell className={td} title={o.name}>
        <div className="truncate font-[family-name:var(--font-display)] font-semibold leading-snug tracking-tight">
          {o.name}
        </div>
        {problem !== "all" ? (
          <div className="mt-1">
            <ProblemHit problem={problem} o={o} />
          </div>
        ) : (
          o.status !== "in_work" && (
            <div className="truncate text-xs leading-snug text-muted-foreground">
              {statusLabel(o.status)}
            </div>
          )
        )}
      </TableCell>
      <TableCell className={`${td} text-muted-foreground`} title={o.address ?? undefined}>
        <div className="truncate">{o.address}</div>
      </TableCell>
      <TableCell className={td} title={o.customer_name ?? undefined}>
        <div className="truncate">{o.customer_name}</div>
      </TableCell>
      <TableCell className={td} title={typeLabel(o.object_type)}>
        <div className="truncate">{typeLabel(o.object_type)}</div>
      </TableCell>
      <TableCell className={td} title={o.responsible_name ?? undefined}>
        <div className="truncate">{o.responsible_name}</div>
      </TableCell>
      <TableCell
        className={td}
        title={
          o.current_stage_number != null
            ? `${o.current_stage_number}. ${o.current_stage_name ?? ""}`
            : undefined
        }
      >
        {o.current_stage_number != null ? (
          <div className="truncate">
            <span className="font-medium tabular-nums">{o.current_stage_number}.</span>{" "}
            <span className="text-muted-foreground">{o.current_stage_name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {problem === "all" &&
          (o.stages_overdue > 0 || o.requests_overdue > 0 || o.requests_new > 0) && (
            <div className="mt-0.5 truncate text-[11px] text-danger">
              {[
                o.stages_overdue > 0 ? `этапы −${o.stages_overdue}` : null,
                o.requests_overdue > 0 ? `заявки −${o.requests_overdue}` : null,
                o.requests_new > 0 ? `новые ${o.requests_new}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
      </TableCell>
      <TableCell className={`${td} align-middle`}>
        <div title={`${o.progress_pct}% · ${o.stages_closed} из ${o.stages_total}`}>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-300"
              style={{ width: `${o.progress_pct}%` }}
            />
          </div>
          <div className="mt-1 text-center text-[11px] tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{o.progress_pct}%</span>
            {" · "}
            {o.stages_closed} из {o.stages_total}
          </div>
        </div>
      </TableCell>
      <TableCell className={`${td} align-middle`}>
        <div className="text-center tabular-nums" title={contractTitle || undefined}>
          <div
            className={
              tone === "bad"
                ? "whitespace-nowrap text-danger"
                : tone === "warn"
                  ? "whitespace-nowrap text-warning"
                  : "whitespace-nowrap"
            }
          >
            {formatDate(o.contract_end) || "—"}
          </div>
          {o.status !== "completed" && o.contract_days_left !== null && (
            <div
              className={
                tone === "bad"
                  ? "mt-0.5 text-[11px] text-danger/70"
                  : tone === "warn"
                    ? "mt-0.5 text-[11px] text-warning/70"
                    : "mt-0.5 text-[11px] text-muted-foreground"
              }
            >
              {daysLeftText(o.contract_days_left)}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
