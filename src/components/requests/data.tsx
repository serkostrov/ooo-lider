import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ToneBadge } from "@/components/ToneBadge";
import { supabase } from "@/integrations/supabase/client";
import { PAGE_SIZE, likeContains, takePage, type CursorPage } from "@/lib/cursor";
import { formatDate } from "@/lib/format";
import { daysBetween, mskToday } from "@/lib/dates";
import { OBJECTS_KEY } from "@/components/objects/data";

export type RequestStatus = "new" | "ready" | "sent" | "accepted" | "done" | "rework";

/** Основной ход заявки (без боковой ветки rework). */
export const REQUEST_FLOW_STATUSES: RequestStatus[] = ["new", "ready", "sent", "accepted", "done"];

export const REQUEST_STATUSES: { v: RequestStatus; label: string; next: string; color: string; sort: number }[] = [
  { v: "new", label: "Новая", next: "", color: "#E2553D", sort: 1 },
  { v: "ready", label: "Готова к отправке", next: "Готова к отправке", color: "#E0A03A", sort: 2 },
  { v: "sent", label: "Отправлена", next: "Отправить", color: "#5B9BC7", sort: 3 },
  { v: "accepted", label: "Принята заказчиком", next: "Принята заказчиком", color: "#3A9BB0", sort: 4 },
  { v: "done", label: "Исполнена", next: "Исполнено", color: "#3DB87A", sort: 5 },
  { v: "rework", label: "Требует доработки", next: "На доработку", color: "#C45C26", sort: 15 },
];

export type RequestStatusDef = (typeof REQUEST_STATUSES)[number];

export const statusInfo = (s: string, list: RequestStatusDef[] = REQUEST_STATUSES) =>
  list.find((x) => x.v === s) ?? list[0]!;

export const REQUEST_STATUSES_KEY = ["dir-request-statuses"] as const;

/**
 * Шаги «Хода заявки». Порядок кодов фиксирован (new → ready → sent → accepted → done).
 * rework — боковая ветка. Из справочника берутся только название, текст кнопки и цвет.
 */
export function useRequestStatuses(): RequestStatusDef[] {
  const { data } = useQuery({
    queryKey: REQUEST_STATUSES_KEY,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_statuses")
        .select("code, name, action_label, color, sort")
        .order("sort");
      if (error) return [];
      return data ?? [];
    },
  });
  return REQUEST_STATUSES.map((d) => {
    const row = data?.find((x) => x.code === d.v);
    return row
      ? {
          ...d,
          label: row.name || d.label,
          next: row.action_label || d.next,
          color: row.color || d.color,
        }
      : d;
  });
}

/** Только линейный ход — для степпера. */
export function useRequestFlowStatuses(): RequestStatusDef[] {
  return useRequestStatuses().filter((s) => REQUEST_FLOW_STATUSES.includes(s.v));
}

export type RequestRow = {
  id: string;
  number: number;
  object_id: string;
  object_name: string;
  request_type_id: string;
  type_name: string;
  representative_id: string | null;
  representative_name: string | null;
  stage_id: string | null;
  initiator_id: string | null;
  initiator_name: string | null;
  office_id: string | null;
  office_name: string | null;
  call_date: string;
  status: RequestStatus;
  sent_at: string | null;
  accepted_at: string | null;
  done_at: string | null;
  done_by: string | null;
  result_text: string | null;
  created_at: string;
  is_new: boolean;
  is_overdue: boolean;
};

export type FieldValue = {
  request_id: string;
  field_id: string;
  label: string;
  field_type: string;
  value: unknown;
};

export const requestsKey = ["requests"] as const;

/**
 * Порядок по умолчанию: сначала «Новые» (по убыванию №),
 * затем остальные (по убыванию №). Просроченные среди остальных выше.
 */
export function sortRequests(rows: RequestRow[]) {
  const rank = (r: RequestRow) => (r.is_new ? 0 : r.is_overdue ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || b.number - a.number || b.call_date.localeCompare(a.call_date),
  );
}

/**
 * Номер вызова в рамках этапа: «15.2» / для подэтапа «12.1.2»
 * (code этапа + порядковый вызов). Без этапа — null.
 */
export function stageCallLabel(
  request: RequestRow,
  allOnObject: RequestRow[],
  stageCodeById: Record<string, string | number>,
): string | null {
  if (!request.stage_id) return null;
  const stageCode = stageCodeById[request.stage_id];
  if (stageCode == null || stageCode === "") return null;
  const peers = allOnObject
    .filter((r) => r.stage_id === request.stage_id)
    .sort((a, b) => a.number - b.number || a.created_at.localeCompare(b.created_at));
  const idx = peers.findIndex((r) => r.id === request.id);
  if (idx < 0) return null;
  return `${stageCode}.${idx + 1}`;
}

/** Подпись этапа для списка/Excel: «12 — Название» или с родителем для подэтапа. */
export function stageDisplayLabel(stage: {
  code?: string | null;
  number?: number | null;
  name: string;
  parent_code?: string | null;
  parent_name?: string | null;
  parent_id?: string | null;
}): string {
  const code = stage.code || (stage.number != null ? String(stage.number) : "");
  const base = code ? `${code} — ${stage.name}` : stage.name;
  if (stage.parent_id && (stage.parent_code || stage.parent_name)) {
    const parent = [stage.parent_code, stage.parent_name].filter(Boolean).join(" ");
    return parent ? `${base} (этап ${parent})` : base;
  }
  return base;
}

export type RequestListFilters = {
  /** Список одного объекта — без пагинации (нужны все для меток вызова). */
  objectId?: string;
  requestTypeId?: string;
  status?: string;
  from?: string;
  to?: string;
  onlyOpen?: boolean;
  onlyOverdue?: boolean;
  archive?: boolean;
  search?: string;
  pageSize?: number;
};

export type RequestCursor = {
  call_date: string;
  number: number;
  id: string;
};

function mapRequestRow(r: Record<string, unknown>): RequestRow {
  return {
    ...(r as unknown as RequestRow),
    is_new: !!r["is_new"],
    is_overdue: !!r["is_overdue"],
  };
}

function applyRequestFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  f: RequestListFilters,
) {
  if (f.objectId) q = q.eq("object_id", f.objectId);
  if (f.requestTypeId) q = q.eq("request_type_id", f.requestTypeId);
  if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("call_date", f.from);
  if (f.to) q = q.lte("call_date", f.to);
  if (f.archive) q = q.eq("status", "done");
  else {
    if (f.onlyOpen) q = q.neq("status", "done");
    if (f.onlyOverdue) q = q.eq("is_overdue", true);
  }
  const like = likeContains(f.search ?? "");
  if (like) {
    const parts = [
      `type_name.ilike.${like}`,
      `object_name.ilike.${like}`,
      `representative_name.ilike.${like}`,
      `result_text.ilike.${like}`,
      `initiator_name.ilike.${like}`,
      `office_name.ilike.${like}`,
    ];
    const digits = (f.search ?? "").trim().replace(/^№/, "");
    if (/^\d+$/.test(digits)) parts.push(`number.eq.${digits}`);
    q = q.or(parts.join(","));
  }
  return q;
}

async function fetchRequestsPage(
  f: RequestListFilters,
  cursor: RequestCursor | null,
): Promise<CursorPage<RequestRow, RequestCursor>> {
  const pageSize = f.pageSize ?? PAGE_SIZE;
  let q = supabase
    .from("v_requests")
    .select("*")
    .order("call_date", { ascending: false })
    .order("number", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);
  q = applyRequestFilters(q, f);
  if (cursor) {
    q = q.or(
      [
        `call_date.lt.${cursor.call_date}`,
        `and(call_date.eq.${cursor.call_date},number.lt.${cursor.number})`,
        `and(call_date.eq.${cursor.call_date},number.eq.${cursor.number},id.lt.${cursor.id})`,
      ].join(","),
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  const mapped = (data ?? []).map((r) => mapRequestRow(r as Record<string, unknown>));
  const { rows, hasMore } = takePage(mapped, pageSize);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor:
      hasMore && last
        ? { call_date: last.call_date, number: last.number, id: last.id }
        : null,
  };
}

/**
 * Курсорный список заявок с фильтрами/поиском на сервере.
 * Для карточки объекта ({@link useRequests}) — без пагинации.
 */
export function useRequestsInfinite(f: RequestListFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...requestsKey, "page", f],
    enabled,
    initialPageParam: null as RequestCursor | null,
    queryFn: ({ pageParam }) => fetchRequestsPage(f, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * Все заявки объекта (до 500) — для меток вызова / шапки / быстрого вызова.
 * Глобальный реестр — через {@link useRequestsInfinite}.
 */
export function useRequests(objectId?: string) {
  return useQuery({
    queryKey: [...requestsKey, "object", objectId ?? ""],
    enabled: !!objectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_requests")
        .select("*")
        .eq("object_id", objectId!)
        .order("call_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return sortRequests((data ?? []).map((r) => mapRequestRow(r as Record<string, unknown>)));
    },
  });
}

/** Значения полей для списка заявок (ключевые поля и поиск по номеру протокола и т. п.). */
export function useFieldValues(requestIds: string[], scope: string) {
  return useQuery({
    queryKey: [...requestsKey, "values", scope, requestIds.length],
    enabled: requestIds.length > 0,
    queryFn: async () => {
      const out: FieldValue[] = [];
      // Ограничение длины URL: запрашиваем пачками
      for (let i = 0; i < requestIds.length; i += 150) {
        const { data, error } = await supabase
          .from("request_field_values")
          .select("request_id, field_id, label, field_type, value")
          .in("request_id", requestIds.slice(i, i + 150));
        if (error) throw error;
        out.push(...((data ?? []) as FieldValue[]));
      }
      return out;
    },
  });
}

export function formatValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (fieldType === "checkbox") return value === true ? "Да" : "Нет";
  if (fieldType === "date" && typeof value === "string") return formatDate(value);
  return String(value);
}

export function overdueDays(r: RequestRow) {
  return r.is_overdue ? daysBetween(r.call_date, mskToday()) : 0;
}

export function RequestStatusBadge({ status }: { status: string }) {
  const s = statusInfo(status, useRequestStatuses());
  return <ToneBadge color={s.color}>{s.label}</ToneBadge>;
}

/** Сбросить всё, что зависит от заявок: списки, счётчики меню и кнопок, сводку объектов, историю. */
export function useRefreshRequests() {
  const qc = useQueryClient();
  return (requestId?: string) => {
    qc.invalidateQueries({ queryKey: requestsKey });
    qc.invalidateQueries({ queryKey: ["requests-attention-count"] });
    qc.invalidateQueries({ queryKey: ["overdue"] });
    qc.invalidateQueries({ queryKey: ["object-request-counts"] });
    qc.invalidateQueries({ queryKey: OBJECTS_KEY });
    qc.invalidateQueries({ queryKey: ["history"] });
    if (requestId) qc.invalidateQueries({ queryKey: ["request", requestId] });
  };
}

/** Открытие карточки снимает «Новая» со счётчика и списка. */
export async function markRequestSeen(requestId: string) {
  const { error } = await supabase.rpc("request_mark_seen", { p_request_id: requestId });
  if (error) throw error;
}

export function useRepresentatives() {
  return useQuery({
    queryKey: ["representatives-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representatives")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return data ?? [];
    },
  });
}
