import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAGE_SIZE, takePage, type CursorPage } from "@/lib/cursor";

export const OVERDUE_KEY = ["overdue"] as const;

/** Ключи просмотренных уведомлений (localStorage) — бейдж колокольчика. */
const ACK_STORAGE = "lider.overdue-notifications-ack";

function readAckKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(ACK_STORAGE);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === "string"));
  } catch {
    return new Set();
  }
}

function writeAckKeys(keys: Iterable<string>) {
  localStorage.setItem(ACK_STORAGE, JSON.stringify([...keys]));
}

/** Сброс при выходе — снова показать текущие просроченные. */
export function clearOverdueNotificationAck() {
  localStorage.removeItem(ACK_STORAGE);
}

export type OverdueKind = "request" | "stage";

export type OverdueItem = {
  key: string;
  kind: OverdueKind;
  id: string;
  objectId: string;
  objectName: string;
  title: string;
  status: string;
  statusColor: string | null;
  responsible: string | null;
  dueDate: string;
  days: number;
  note: string | null;
};

export type OverdueListFilters = {
  kind?: "all" | OverdueKind;
  objectId?: string;
  pageSize?: number;
};

export type OverdueCursor = { days: number; id: string };

type OverdueRow = {
  kind: string;
  id: string;
  object_id: string;
  object_name: string;
  title: string;
  status: string;
  status_color: string | null;
  responsible: string | null;
  due_date: string;
  days: number;
  note: string | null;
};

function mapRow(r: OverdueRow): OverdueItem {
  const kind = r.kind === "stage" ? "stage" : "request";
  return {
    key: `${kind[0]}-${r.id}`,
    kind,
    id: r.id,
    objectId: r.object_id,
    objectName: r.object_name,
    title: r.title,
    status: r.status,
    statusColor: r.status_color,
    responsible: r.responsible,
    dueDate: r.due_date,
    days: Number(r.days) || 0,
    note: r.note,
  };
}

/** View ещё может отсутствовать в сгенерированных типах. */
function overdueTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("v_overdue");
}

function applyOverdueFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  f: OverdueListFilters,
) {
  if (f.kind && f.kind !== "all") q = q.eq("kind", f.kind);
  if (f.objectId) q = q.eq("object_id", f.objectId);
  return q;
}

async function fetchOverduePage(
  f: OverdueListFilters,
  cursor: OverdueCursor | null,
): Promise<CursorPage<OverdueItem, OverdueCursor>> {
  const pageSize = f.pageSize ?? PAGE_SIZE;
  let q = overdueTable()
    .select(
      "kind, id, object_id, object_name, title, status, status_color, responsible, due_date, days, note",
    )
    .order("days", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  q = applyOverdueFilters(q, f);
  if (cursor) {
    q = q.or(
      [`days.lt.${cursor.days}`, `and(days.eq.${cursor.days},id.lt.${cursor.id})`].join(","),
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  const mapped = ((data ?? []) as unknown as OverdueRow[]).map(mapRow);
  const { rows, hasMore } = takePage(mapped, pageSize);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? { days: last.days, id: last.id } : null,
  };
}

/** Курсорный список просроченных (фильтры на сервере). */
export function useOverdueInfinite(f: OverdueListFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...OVERDUE_KEY, "page", f],
    initialPageParam: null as OverdueCursor | null,
    queryFn: ({ pageParam }) => fetchOverduePage(f, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  });
}

/** Счётчики для бейджа меню и табов — без выгрузки строк. */
export function useOverdueCounts(objectId?: string) {
  return useQuery({
    queryKey: [...OVERDUE_KEY, "counts", objectId ?? ""],
    refetchInterval: 60_000,
    queryFn: async () => {
      const base = (kind?: OverdueKind) => {
        let q = overdueTable().select("id", { count: "exact", head: true });
        if (objectId) q = q.eq("object_id", objectId);
        if (kind) q = q.eq("kind", kind);
        return q;
      };
      const [all, stages, requests] = await Promise.all([
        base(),
        base("stage"),
        base("request"),
      ]);
      if (all.error) throw all.error;
      if (stages.error) throw stages.error;
      if (requests.error) throw requests.error;
      return {
        total: all.count ?? 0,
        stages: stages.count ?? 0,
        requests: requests.count ?? 0,
      };
    },
  });
}

/** Объекты, у которых есть просрочка — для селекта фильтра. */
export function useOverdueObjectOptions() {
  return useQuery({
    queryKey: [...OVERDUE_KEY, "objects"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await overdueTable()
        .select("object_id, object_name")
        .order("object_name")
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as unknown as { object_id: string; object_name: string }[]) {
        if (r.object_id) map.set(r.object_id, r.object_name);
      }
      return [...map.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    },
  });
}

/**
 * Лёгкий превью-набор (гейт при входе / колокольчик): топ по дням + ключи для ack.
 * Не тянет полные карточки сверх limit.
 */
export function useOverduePreview(limit = 40) {
  return useQuery({
    queryKey: [...OVERDUE_KEY, "preview", limit],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await overdueTable()
        .select(
          "kind, id, object_id, object_name, title, status, status_color, responsible, due_date, days, note",
        )
        .order("days", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as OverdueRow[]).map(mapRow);
    },
  });
}

/** Все ключи просрочки (kind+id) — для «просмотреть все» в колокольчике. */
async function fetchAllOverdueKeys(): Promise<string[]> {
  const keys: string[] = [];
  const page = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await overdueTable()
      .select("kind, id")
      .order("id")
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as { kind: string; id: string }[];
    for (const r of rows) {
      const kind = r.kind === "stage" ? "stage" : "request";
      keys.push(`${kind[0]}-${r.id}`);
    }
    if (rows.length < page) break;
    from += page;
  }
  return keys;
}

/**
 * Непросмотренные для колокольчика: превью + сверка ключей с localStorage.
 * Бейдж — число непросмотренных ключей (лёгкий select kind,id), не полный список строк.
 */
export function useOverdueNotifications() {
  const preview = useOverduePreview(30);
  const keysQ = useQuery({
    queryKey: [...OVERDUE_KEY, "keys"],
    refetchInterval: 60_000,
    queryFn: fetchAllOverdueKeys,
  });
  const [tick, setTick] = useState(0);
  const acked = useMemo(() => {
    void tick;
    return readAckKeys();
  }, [tick]);

  const allKeys = keysQ.data ?? [];
  const unseenKeys = useMemo(() => allKeys.filter((k) => !acked.has(k)), [allKeys, acked]);
  const unseenSet = useMemo(() => new Set(unseenKeys), [unseenKeys]);
  const items = useMemo(
    () => (preview.data ?? []).filter((it) => unseenSet.has(it.key)),
    [preview.data, unseenSet],
  );

  const markSeen = useCallback((keys: string[]) => {
    if (keys.length === 0) {
      setTick((n) => n + 1);
      return;
    }
    const next = readAckKeys();
    for (const k of keys) next.add(k);
    writeAckKeys(next);
    setTick((n) => n + 1);
  }, []);

  const markAllSeen = useCallback(() => {
    void (async () => {
      const keys = keysQ.data ?? (await fetchAllOverdueKeys());
      markSeen(keys);
    })();
  }, [keysQ.data, markSeen]);

  return {
    items,
    /** Непросмотренных всего (для бейджа колокольчика). */
    unseenCount: unseenKeys.length,
    allCount: allKeys.length,
    isLoading: preview.isLoading || keysQ.isLoading,
    isReady: !!preview.data && !!keysQ.data,
    markAllSeen,
    markSeen,
  };
}

/**
 * @deprecated Для совместимости гейта/старого кода — превью + counts.
 * Страница /overdue использует {@link useOverdueInfinite}.
 */
export function useOverdueItems() {
  const preview = useOverduePreview(100);
  const counts = useOverdueCounts();
  return {
    items: preview.data ?? [],
    isLoading: preview.isLoading || counts.isLoading,
    isReady: !!preview.data && !!counts.data,
    total: counts.data?.total ?? preview.data?.length ?? 0,
    stagesCount: counts.data?.stages ?? 0,
    requestsCount: counts.data?.requests ?? 0,
  };
}

/** 2026-10-23 → 23.10.2026 */
export function formatDay(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}
