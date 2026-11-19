import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { formatDue, type DirectorListItem } from "@/components/director/data";
import { RequestStatusButton } from "@/components/stages/RequestStatusButton";
import { useProfile } from "@/lib/profile";

type KindFilter = "all" | "stage" | "request";

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

function ListPanel({
  title,
  empty,
  items,
  loading,
  variant,
  kindFilter,
  onKindFilterChange,
  showKindFilter,
  showAskStatus,
}: {
  title: string;
  empty: string;
  items: DirectorListItem[] | undefined;
  loading: boolean;
  variant: "overdue" | "soon";
  kindFilter?: KindFilter;
  onKindFilterChange?: (v: KindFilter) => void;
  showKindFilter?: boolean;
  showAskStatus?: boolean;
}) {
  const stagesCount = items?.filter((i) => i.kind === "stage").length ?? 0;
  const requestsCount = items?.filter((i) => i.kind === "request").length ?? 0;
  const filtered = useMemo(() => {
    if (!items) return items;
    if (!kindFilter || kindFilter === "all") return items;
    return items.filter((i) => i.kind === kindFilter);
  }, [items, kindFilter]);

  const count = filtered?.length ?? 0;

  return (
    <div className="flex max-h-[420px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)]">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "size-2.5 rounded-full",
                variant === "overdue" ? "bg-danger" : "bg-warning",
              )}
            />
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums",
              variant === "overdue"
                ? "bg-danger-soft text-danger"
                : "bg-warning-soft text-warning",
            )}
          >
            {count}
          </span>
        </div>
        {showKindFilter && onKindFilterChange && kindFilter ? (
          <Tabs
            value={kindFilter}
            onValueChange={(v) => onKindFilterChange(v as KindFilter)}
          >
            <TabsList className={`${tabsListClass} mb-0`}>
              <TabsTrigger value="all" className={tabTriggerClass}>
                Всё ({items?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="stage" className={tabTriggerClass}>
                Этапы ({stagesCount})
              </TabsTrigger>
              <TabsTrigger value="request" className={tabTriggerClass}>
                Заявки ({requestsCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading && !items ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : !filtered?.length ? (
          <p className="px-4 py-10 text-center text-base text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1.5 p-2.5">
            {filtered.map((item) => {
              const link = itemTo(item);
              const daysAbs = Math.abs(item.daysLeft ?? 0);
              const daysText =
                variant === "overdue"
                  ? daysAbs === 1
                    ? "1 день"
                    : `${daysAbs} дн.`
                  : item.daysLeft == null
                    ? "—"
                    : item.daysLeft === 0
                      ? "сегодня"
                      : item.daysLeft === 1
                        ? "завтра"
                        : `${item.daysLeft} дн.`;

              return (
                <li key={item.key}>
                  <Link
                    to={link.to}
                    params={link.params}
                    className="group flex items-start gap-3 rounded-lg border border-transparent px-3.5 py-3 transition-colors hover:border-border/70 hover:bg-muted/35"
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                        item.kind === "stage"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.kind === "stage" ? "этап" : "заявка"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-base font-semibold text-foreground">
                          {item.title}
                        </div>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="mt-1 truncate text-sm text-muted-foreground">
                        {item.objectName}
                        {item.responsible ? ` · ${item.responsible}` : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="size-3.5" />
                          {formatDue(item.dueDate)}
                        </span>
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-sm font-semibold",
                            variant === "overdue"
                              ? "bg-danger-soft text-danger"
                              : item.daysLeft != null && item.daysLeft <= 1
                                ? "bg-warning-soft text-warning"
                                : "bg-muted text-foreground",
                          )}
                        >
                          {daysText}
                        </span>
                        {showAskStatus && item.kind === "stage" ? (
                          <RequestStatusButton stageId={item.id} compact />
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DirectorLists({
  overdue,
  dueSoon,
  loading,
}: {
  overdue: DirectorListItem[] | undefined;
  dueSoon: DirectorListItem[] | undefined;
  loading: boolean;
}) {
  const { is_admin } = useProfile();
  const [overdueKind, setOverdueKind] = useState<KindFilter>("all");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ListPanel
        title="Просрочка"
        empty={
          overdueKind === "stage"
            ? "Просроченных этапов нет"
            : overdueKind === "request"
              ? "Просроченных заявок нет"
              : "Просроченных нет — хорошо"
        }
        items={overdue}
        loading={loading}
        variant="overdue"
        showKindFilter
        kindFilter={overdueKind}
        onKindFilterChange={setOverdueKind}
        showAskStatus={is_admin}
      />
      <ListPanel
        title="Скоро срок"
        empty="Ближайших сроков нет"
        items={dueSoon}
        loading={loading}
        variant="soon"
        showAskStatus={is_admin}
      />
    </div>
  );
}
