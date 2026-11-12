import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { tabsListClass, tabTriggerClass, tableWrapClass, thClass } from "@/lib/ui";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToneBadge } from "@/components/ToneBadge";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { SortableTh } from "@/components/SortableTh";
import {
  formatDay,
  useOverdueCounts,
  useOverdueInfinite,
  useOverdueObjectOptions,
  type OverdueItem,
  type OverdueListFilters,
} from "@/components/overdue/data";

type OverdueSort = "what" | "object" | "status" | "responsible" | "due" | "days";

const OVERDUE_GETTERS: Record<OverdueSort, (i: OverdueItem) => unknown> = {
  what: (i) => i.title,
  object: (i) => i.objectName,
  status: (i) => i.status,
  responsible: (i) => i.responsible,
  due: (i) => i.dueDate,
  days: (i) => i.days,
};

export const Route = createFileRoute("/_authenticated/overdue")({
  component: OverduePage,
  head: () => ({
    meta: [
      { title: "Просрочено — Лидер" },
      { name: "description", content: "Просроченные заявки и этапы в системе «Лидер»" },
    ],
  }),
});

const ALL = "__all";
type Kind = "all" | "stage" | "request";

function OverduePage() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [objectId, setObjectId] = useState(ALL);

  const filters: OverdueListFilters = useMemo(
    () => ({
      kind,
      ...(objectId !== ALL ? { objectId } : {}),
    }),
    [kind, objectId],
  );

  const pageQuery = useOverdueInfinite(filters);
  const { data: counts, isLoading: countsLoading } = useOverdueCounts(
    objectId !== ALL ? objectId : undefined,
  );
  const { data: objectOptions = [] } = useOverdueObjectOptions();

  const items = pageQuery.data?.pages.flatMap((p) => p.rows) ?? [];
  const isLoading = pageQuery.isLoading;
  const total = counts?.total ?? 0;
  const stagesCount = counts?.stages ?? 0;
  const requestsCount = counts?.requests ?? 0;

  const { sort, toggle } = useTableSort<OverdueSort>({ key: "days", dir: "desc" });
  const rows = useSortedRows(items, sort, OVERDUE_GETTERS);

  const open = (it: OverdueItem) =>
    it.kind === "request"
      ? navigate({ to: "/requests/$requestId", params: { requestId: it.id } })
      : navigate({
          to: "/objects/$id/stages/$stageId",
          params: { id: it.objectId, stageId: it.id },
        });

  const tabTotal =
    kind === "all" ? total : kind === "stage" ? stagesCount : requestsCount;

  return (
    <PageFrame
      header={
        <>
          <PageHeader
            title={
              <span className="inline-flex items-center gap-3">
                Просрочено
                {!countsLoading && total > 0 && (
                  <span className="rounded-full bg-danger px-2.5 text-sm font-semibold leading-6 text-danger-foreground">
                    {total}
                  </span>
                )}
              </span>
            }
            description="Этапы, у которых прошёл срок, и заявки, не исполненные к дате созвона. Сначала то, что опаздывает дольше всего."
            className="mb-3"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <TabsList className={`${tabsListClass} mb-0`}>
                <TabsTrigger value="all" className={tabTriggerClass}>
                  Всё ({countsLoading ? "…" : total})
                </TabsTrigger>
                <TabsTrigger value="stage" className={tabTriggerClass}>
                  Этапы ({countsLoading ? "…" : stagesCount})
                </TabsTrigger>
                <TabsTrigger value="request" className={tabTriggerClass}>
                  Заявки ({countsLoading ? "…" : requestsCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={objectId} onValueChange={setObjectId}>
              <SelectTrigger className="h-9 w-72 max-w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="text-sm">
                  Все объекты
                </SelectItem>
                {objectOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-sm">
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
    >
      {isLoading ? (
        <div className={tableWrapClass}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left">
                <SortableTh column="what" sort={sort} onToggle={toggle}>
                  Что
                </SortableTh>
                <SortableTh column="object" sort={sort} onToggle={toggle}>
                  Объект
                </SortableTh>
                <SortableTh column="status" sort={sort} onToggle={toggle}>
                  Статус
                </SortableTh>
                <SortableTh column="responsible" sort={sort} onToggle={toggle}>
                  Ответственный
                </SortableTh>
                <SortableTh column="due" sort={sort} onToggle={toggle}>
                  Срок
                </SortableTh>
                <SortableTh column="days" sort={sort} onToggle={toggle}>
                  Просрочено
                </SortableTh>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              <OverdueTableSkeleton />
            </tbody>
          </table>
        </div>
      ) : tabTotal === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-card py-12 text-center">
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-sm font-semibold">
            {objectId !== ALL || kind !== "all" ? "Ничего не найдено" : "Просроченного нет"}
          </p>
          <p className="text-sm text-muted-foreground">
            {objectId !== ALL || kind !== "all"
              ? "Сбросьте фильтр или выберите другой объект"
              : "Все этапы и заявки в срок"}
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className={tableWrapClass}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left">
                <SortableTh column="what" sort={sort} onToggle={toggle}>
                  Что
                </SortableTh>
                <SortableTh column="object" sort={sort} onToggle={toggle}>
                  Объект
                </SortableTh>
                <SortableTh column="status" sort={sort} onToggle={toggle}>
                  Статус
                </SortableTh>
                <SortableTh column="responsible" sort={sort} onToggle={toggle}>
                  Ответственный
                </SortableTh>
                <SortableTh column="due" sort={sort} onToggle={toggle}>
                  Срок
                </SortableTh>
                <SortableTh column="days" sort={sort} onToggle={toggle}>
                  Просрочено
                </SortableTh>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Ничего не найдено
                  </td>
                </tr>
              ) : (
                rows.map((it) => (
                  <tr
                    key={it.key}
                    onClick={() => open(it)}
                    className="cursor-pointer border-t border-border/70 bg-danger-soft/50 transition-colors hover:bg-danger-soft"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{it.title}</div>
                      {it.note && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{it.note}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">{it.objectName}</td>
                    <td className="px-5 py-3">
                      <ToneBadge color={it.statusColor}>{it.status}</ToneBadge>
                    </td>
                    <td className="px-5 py-3">
                      {it.responsible ?? <span className="text-warning">Не назначен</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                      {formatDay(it.dueDate)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-bold tabular-nums text-danger">
                      <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
                      {it.days} дн.
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        variant="outline"
                        className="h-9 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(it);
                        }}
                      >
                        Открыть
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <InfiniteScrollSentinel
            rootRef={scrollRef}
            hasMore={!!pageQuery.hasNextPage}
            loading={pageQuery.isFetchingNextPage}
            onLoadMore={() => void pageQuery.fetchNextPage()}
          />
        </div>
      )}
    </PageFrame>
  );
}

function OverdueTableSkeleton({ rows = 8 }: { rows?: number }) {
  const cell = "px-5 py-3";
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-border/60">
          <td className={cell}>
            <Skeleton height={16} width="75%" />
            <Skeleton height={12} width="40%" className="mt-1.5" />
          </td>
          <td className={cell}>
            <Skeleton height={16} width="85%" />
          </td>
          <td className={cell}>
            <Skeleton height={22} width={88} borderRadius={6} />
          </td>
          <td className={cell}>
            <Skeleton height={16} width="70%" />
          </td>
          <td className={cell}>
            <Skeleton height={16} width={80} />
          </td>
          <td className={cell}>
            <Skeleton height={16} width={64} />
          </td>
          <td className={`${cell} text-right`}>
            <Skeleton height={36} width={88} borderRadius={6} inline />
          </td>
        </tr>
      ))}
    </>
  );
}
