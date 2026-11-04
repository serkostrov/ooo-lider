import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { daysBetween, mskToday } from "@/lib/dates";
import { useObjects } from "@/components/objects/data";
import { statusInfo, useRequestStatuses } from "@/components/requests/data";

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

export type OverdueItem = {
  key: string;
  kind: "request" | "stage";
  id: string;
  objectId: string;
  objectName: string;
  /** «Заявка №12 «Технадзор»» / «Этап 18 «Раскопка траншеи»» */
  title: string;
  status: string;
  statusColor: string | null;
  /** Кто отвечает: исполнитель этапа / офис по заявке (если не назначен — инициатор). */
  responsible: string | null;
  /** Срок: дата этапа или дата созвона по заявке, YYYY-MM-DD. */
  dueDate: string;
  days: number;
  note: string | null;
};

/**
 * Просроченные заявки и этапы по видимым пользователю незавершённым объектам.
 * Один источник для колокольчика уведомлений, бейджа в меню и раздела «Просрочено».
 * Видимость ограничивает RLS.
 */
export function useOverdueItems() {
  const { data: objects = [], isLoading: objectsLoading } = useObjects();
  const statuses = useRequestStatuses();
  const q = useQuery({
    queryKey: OVERDUE_KEY,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [req, st] = await Promise.all([
        supabase
          .from("v_requests")
          .select("id, number, type_name, object_id, call_date, status, office_name, initiator_name")
          .eq("is_overdue", true),
        supabase
          .from("v_object_stages")
          .select("id, number, name, object_id, due_date, status_name, status_color, executor_name, note")
          .eq("is_overdue", true)
          .eq("is_excluded", false),
      ]);
      if (req.error) throw req.error;
      if (st.error) throw st.error;
      return { requests: req.data ?? [], stages: st.data ?? [] };
    },
  });

  const active = new Map(objects.filter((o) => o.status !== "completed").map((o) => [o.id, o.name]));
  const today = mskToday();
  const items: OverdueItem[] = q.data
    ? [
        ...q.data.requests
          .filter((r) => r.id && r.object_id && r.call_date && active.has(r.object_id))
          .map((r) => {
            const s = statusInfo(r.status ?? "new", statuses);
            return {
              key: `r-${r.id}`,
              kind: "request" as const,
              id: r.id!,
              objectId: r.object_id!,
              objectName: active.get(r.object_id!) ?? "",
              title: `Заявка №${r.number} «${r.type_name}»`,
              status: s.label,
              statusColor: s.color,
              responsible: r.office_name ?? r.initiator_name ?? null,
              dueDate: r.call_date!,
              days: daysBetween(r.call_date!, today),
              note: null,
            };
          }),
        ...q.data.stages
          .filter((s) => s.id && s.object_id && s.due_date && active.has(s.object_id))
          .map((s) => ({
            key: `s-${s.id}`,
            kind: "stage" as const,
            id: s.id!,
            objectId: s.object_id!,
            objectName: active.get(s.object_id!) ?? "",
            title: `Этап ${s.number} «${s.name}»`,
            status: s.status_name ?? "",
            statusColor: s.status_color ?? null,
            responsible: s.executor_name ?? null,
            dueDate: s.due_date!,
            days: daysBetween(s.due_date!, today),
            note: s.note ?? null,
          })),
      ].sort((a, b) => b.days - a.days)
    : [];

  return { items, isLoading: q.isLoading || objectsLoading, isReady: !!q.data && !objectsLoading };
}

/**
 * Непросмотренные просроченные для колокольчика.
 * «Просмотреть все» помечает текущий набор как прочитанный — бейдж пропадает,
 * пока не появятся новые ключи.
 */
export function useOverdueNotifications() {
  const { items, isLoading, isReady } = useOverdueItems();
  const [tick, setTick] = useState(0);
  const acked = useMemo(() => {
    void tick;
    return readAckKeys();
  }, [tick]);
  const unseen = useMemo(() => items.filter((it) => !acked.has(it.key)), [items, acked]);

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
    markSeen(items.map((it) => it.key));
  }, [items, markSeen]);

  return { items: unseen, allCount: items.length, isLoading, isReady, markAllSeen, markSeen };
}

/** 2026-10-23 → 23.10.2026 */
export function formatDay(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}
