import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ClipboardList,
  Clock3,
  MessageSquareOff,
  Search,
  UserX,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  DIRECTOR_PROBLEM_META,
  formatDue,
  type DirectorKpi,
  type DirectorListItem,
  type DirectorProblemKey,
  type DirectorProblems,
} from "@/components/director/data";

type Tone = "neutral" | "danger" | "warning" | "info" | "success";

const PROBLEMS: {
  key: DirectorProblemKey;
  label: string;
  hint: string;
  tone: Tone;
  icon: typeof AlertTriangle;
}[] = [
  {
    key: "stagesOverdue",
    label: "Просроч. этапы",
    hint: "Нужен разбор сроков",
    tone: "danger",
    icon: AlertTriangle,
  },
  {
    key: "requestsOverdue",
    label: "Просроч. заявки",
    hint: "Заявки за сроком",
    tone: "danger",
    icon: ClipboardList,
  },
  {
    key: "onReview",
    label: "На проверке",
    hint: "Ждут подтверждения",
    tone: "info",
    icon: Search,
  },
  {
    key: "noExecutor",
    label: "Без исполнителя",
    hint: "Некому вести",
    tone: "warning",
    icon: UserX,
  },
  {
    key: "noResponse",
    label: "Без ответа",
    hint: "Нет реакции",
    tone: "warning",
    icon: MessageSquareOff,
  },
];

const toneBox: Record<Tone, string> = {
  neutral: "border-border/70 bg-card",
  danger: "border-danger/25 bg-danger-soft/35",
  warning: "border-warning/25 bg-warning-soft/40",
  info: "border-primary/20 bg-primary/5",
  success: "border-success/25 bg-success-soft/40",
};

const toneIcon: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-primary",
  success: "text-success",
};

const toneValue: Record<Tone, string> = {
  neutral: "text-foreground",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-foreground",
  success: "text-success",
};

function itemTo(item: DirectorListItem) {
  if (item.kind === "stage") {
    return {
      to: "/objects/$id/stages/$stageId" as const,
      params: { id: item.objectId, stageId: item.id },
    };
  }
  return {
    to: "/requests/$requestId" as const,
    params: { requestId: item.id },
  };
}

function daysLabel(item: DirectorListItem) {
  const d = item.daysLeft;
  if (d == null) return "—";
  if (d < 0) {
    const abs = Math.abs(d);
    return abs === 1 ? "1 день" : `${abs} дн.`;
  }
  if (d === 0) return "сегодня";
  if (d === 1) return "завтра";
  return `${d} дн.`;
}

function ProblemItemRow({
  item,
  compact,
  onNavigate,
}: {
  item: DirectorListItem;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const link = itemTo(item);
  const overdue = (item.daysLeft ?? 0) < 0;
  return (
    <Link
      to={link.to}
      params={link.params}
      onClick={onNavigate}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border border-transparent transition-colors hover:border-border/70 hover:bg-muted/40",
        compact ? "px-2 py-1.5" : "px-3 py-2.5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          item.kind === "stage" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {item.kind === "stage" ? "этап" : "заявка"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "min-w-0 truncate font-medium text-foreground",
              compact ? "text-sm" : "text-base font-semibold",
            )}
          >
            {item.title}
          </div>
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.objectName}
          {item.responsible ? ` · ${item.responsible}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />
            {formatDue(item.dueDate)}
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-semibold",
              overdue ? "bg-danger-soft text-danger" : "bg-muted text-foreground",
            )}
          >
            {daysLabel(item)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative size-[128px] shrink-0">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-muted/40"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums tracking-tight">
          {clamped}%
        </span>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">среднее</span>
      </div>
    </div>
  );
}

export function DirectorKpiCards({
  kpi,
  problems,
  loading,
}: {
  kpi: DirectorKpi | undefined;
  problems: DirectorProblems | undefined;
  loading: boolean;
}) {
  const [openKey, setOpenKey] = useState<DirectorProblemKey | null>(null);

  if (loading && !kpi) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <Skeleton className="h-[168px] rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {PROBLEMS.map((p, i) => (
            <Skeleton
              key={p.key}
              className={cn(
                "h-[108px] rounded-xl",
                i === PROBLEMS.length - 1 && "col-span-2 sm:col-span-1",
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  const avg = kpi?.avgProgressPct ?? 0;
  const closed = kpi?.stagesClosed ?? 0;
  const total = kpi?.stagesTotal ?? 0;
  const openItems = openKey ? (problems?.[openKey] ?? []) : [];
  const openMeta = openKey ? DIRECTOR_PROBLEM_META[openKey] : null;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-5 shadow-[var(--surface-glow)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-primary/10 blur-2xl"
          />
          <div className="relative flex items-center gap-4">
            <ProgressRing pct={avg} />
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 className="size-4 shrink-0" />
                Сводка
              </div>
              <div>
                <div className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums tracking-tight">
                  {kpi?.objectsInWork ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">объектов в работе</div>
              </div>
              <div className="text-sm tabular-nums text-muted-foreground">
                Этапы:{" "}
                <span className="font-semibold text-foreground">
                  {closed}/{total}
                </span>{" "}
                закрыто
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {PROBLEMS.map((p, i) => {
            const Icon = p.icon;
            const value = Number(kpi?.[p.key] ?? 0);
            const hot = value > 0 && (p.tone === "danger" || p.tone === "warning");
            const items = problems?.[p.key] ?? [];
            const preview = items.slice(0, 5);
            const interactive = value > 0;
            const lastMobileFull = i === PROBLEMS.length - 1;

            const card = (
              <button
                type="button"
                disabled={!interactive}
                onClick={() => interactive && setOpenKey(p.key)}
                className={cn(
                  "flex h-full w-full flex-col justify-between rounded-xl border px-3.5 py-3 text-left shadow-[var(--surface-glow)] transition-colors",
                  toneBox[p.tone],
                  interactive
                    ? "cursor-pointer hover:brightness-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    : "cursor-default opacity-90",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm leading-snug text-muted-foreground">{p.label}</span>
                  <Icon className={cn("size-4 shrink-0", toneIcon[p.tone])} />
                </div>
                <div className="mt-2">
                  <div
                    className={cn(
                      "font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums tracking-tight",
                      hot ? toneValue[p.tone] : "text-foreground",
                    )}
                  >
                    {value}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {interactive ? `${p.hint} · нажмите` : p.hint}
                  </div>
                </div>
              </button>
            );

            const wrap = (node: ReactNode) => (
              <div
                key={p.key}
                className={cn(lastMobileFull && "col-span-2 sm:col-span-1")}
              >
                {node}
              </div>
            );

            if (!interactive) {
              return wrap(card);
            }

            return wrap(
              <HoverCard openDelay={180} closeDelay={80}>
                <HoverCardTrigger asChild>{card}</HoverCardTrigger>
                <HoverCardContent
                  align="start"
                  side="bottom"
                  className="w-[340px] border-border/70 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">{p.label}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">{items.length}</div>
                  </div>
                  {preview.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      Список пока пуст — счётчик с объектов, детали подгрузятся
                    </p>
                  ) : (
                    <ul className="max-h-[260px] space-y-1 overflow-y-auto">
                      {preview.map((item) => (
                        <li key={item.key}>
                          <ProblemItemRow
                            item={item}
                            compact
                            onNavigate={() => setOpenKey(null)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {items.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2 h-8 w-full text-sm"
                      onClick={() => setOpenKey(p.key)}
                    >
                      {items.length > preview.length
                        ? `Показать все (${items.length})`
                        : "Открыть список"}
                    </Button>
                  ) : null}
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      </div>

      <Sheet open={openKey != null} onOpenChange={(o) => !o && setOpenKey(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 text-left">
            <SheetTitle className="font-[family-name:var(--font-display)] text-xl">
              {openMeta?.label ?? "Проблемы"}
            </SheetTitle>
            <SheetDescription className="text-sm">
              {openMeta?.hint}
              {openItems.length > 0 ? ` · ${openItems.length}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {openItems.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Нет позиций в списке
              </p>
            ) : (
              <ul className="space-y-1">
                {openItems.map((item) => (
                  <li key={item.key}>
                    <ProblemItemRow item={item} onNavigate={() => setOpenKey(null)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
