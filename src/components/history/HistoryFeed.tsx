import { useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAGE_SIZE, takePage } from "@/lib/cursor";
import { formatDateTime } from "@/lib/dates";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type HistoryFilter = {
  objectId?: string;
  entityType?: string;
  entityId?: string;
  /** Коды action из history (один или несколько). */
  actions?: string[];
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  pageSize?: number;
};

export type HistoryItem = {
  id: number;
  created_at: string;
  message: string;
  entity_type: string;
  object_id: string | null;
  actor: { full_name: string } | null;
  object: { name: string } | null;
};

/** Курсор: bigint id (identity) — монотонный и совпадает с порядком created_at. */
export type HistoryCursor = number;

export function historyKey(f: HistoryFilter) {
  return [
    "history",
    f.objectId ?? "",
    f.entityType ?? "",
    f.entityId ?? "",
    (f.actions ?? []).slice().sort().join(","),
    f.from ?? "",
    f.to ?? "",
    f.pageSize ?? PAGE_SIZE,
  ];
}

async function fetchHistoryPage(f: HistoryFilter, cursor: HistoryCursor | null) {
  const pageSize = f.pageSize ?? PAGE_SIZE;
  let q = supabase
    .from("history")
    .select(
      "id, created_at, message, entity_type, object_id, actor:profiles!history_actor_id_fkey(full_name), object:objects!history_object_id_fkey(name)",
    )
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  if (f.objectId) q = q.eq("object_id", f.objectId);
  if (f.entityType) q = q.eq("entity_type", f.entityType);
  if (f.entityId) q = q.eq("entity_id", f.entityId);
  if (f.actions?.length === 1) q = q.eq("action", f.actions[0]!);
  else if (f.actions && f.actions.length > 1) q = q.in("action", f.actions);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+03:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59+03:00`);
  if (cursor != null) q = q.lt("id", cursor);

  const { data, error } = await q;
  if (error) throw error;
  const raw = (data ?? []) as unknown as HistoryItem[];
  const { rows, hasMore } = takePage(raw, pageSize);
  return {
    rows,
    nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null,
  };
}

export function useHistory(f: HistoryFilter) {
  return useInfiniteQuery({
    queryKey: historyKey(f),
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ pageParam }) => fetchHistoryPage(f, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Лента истории: дата, кто, что — таблицей на десктопе, карточками на мобиле. */
export function HistoryFeed({
  filter,
  showObject,
  fillHeight,
}: {
  filter: HistoryFilter;
  showObject?: boolean;
  fillHeight?: boolean;
}) {
  const isMobile = useIsMobile();
  const q = useHistory(filter);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const isLoading = q.isLoading;
  const error = q.error;

  if (error) {
    return (
      <p className={cn("py-4 text-sm text-destructive", fillHeight && "h-full")}>
        Не удалось загрузить историю
      </p>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <p className={cn("py-4 text-sm text-muted-foreground", fillHeight && "h-full")}>
        Записей пока нет
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={
        fillHeight
          ? "max-h-full min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card"
          : "overflow-x-auto rounded-md border border-border bg-card"
      }
    >
      {isMobile ? (
        <div className="space-y-2 p-2">
          {isLoading
            ? Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="rounded-lg border border-border/70 p-3">
                  <Skeleton height={12} width="45%" />
                  <Skeleton height={14} width="70%" className="mt-2" />
                  <Skeleton height={12} width="90%" className="mt-2" />
                </div>
              ))
            : rows.map((h) => (
                <article
                  key={h.id}
                  className="rounded-lg border border-border/70 bg-card px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <time className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(h.created_at)}
                    </time>
                    <span className="text-xs font-medium text-foreground">
                      {h.actor?.full_name ?? "Система"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-foreground">{h.message}</p>
                  {showObject && h.object?.name ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={h.object.name}>
                      {h.object.name}
                    </p>
                  ) : null}
                </article>
              ))}
        </div>
      ) : (
        <Table className="text-sm" containerClassName="max-h-none overflow-visible">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44 whitespace-nowrap">Дата</TableHead>
              <TableHead className="w-52">Кто</TableHead>
              <TableHead>Событие</TableHead>
              {showObject && <TableHead className="w-[20rem]">Объект</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <HistoryTableSkeleton showObject={!!showObject} />
            ) : (
              rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateTime(h.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">{h.actor?.full_name ?? "Система"}</TableCell>
                  <TableCell>{h.message}</TableCell>
                  {showObject && (
                    <TableCell className="max-w-[20rem] text-muted-foreground">
                      <div className="line-clamp-2" title={h.object?.name ?? undefined}>
                        {h.object?.name ?? "—"}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
      <InfiniteScrollSentinel
        rootRef={scrollRef}
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onLoadMore={() => void q.fetchNextPage()}
      />
    </div>
  );
}

function HistoryTableSkeleton({ showObject, rows = 10 }: { showObject: boolean; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell>
            <Skeleton height={16} width={128} />
          </TableCell>
          <TableCell>
            <Skeleton height={16} width="70%" />
          </TableCell>
          <TableCell>
            <Skeleton height={16} width="92%" />
          </TableCell>
          {showObject && (
            <TableCell>
              <Skeleton height={16} width="80%" />
            </TableCell>
          )}
        </TableRow>
      ))}
    </>
  );
}
