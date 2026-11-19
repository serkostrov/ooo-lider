import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export type NotificationKind =
  | "overdue_stage"
  | "due_soon"
  | "no_response"
  | "no_executor"
  | "on_review"
  | "overdue_request"
  | "status_ask"
  | "stage_message_reply"
  | "stage_status_reply"
  | "stage_message_mention"
  | "password_reset";

export type NotificationItem = {
  eventKey: string;
  kind: NotificationKind;
  objectId: string | null;
  objectName: string;
  entityType: "stage" | "request" | "profile";
  entityId: string;
  title: string;
  status: string;
  statusColor: string | null;
  dueDate: string | null;
  days: number;
  unread: boolean;
};

type EventRow = {
  event_key: string;
  kind: string;
  object_id: string | null;
  object_name: string;
  entity_type: string;
  entity_id: string;
  title: string;
  status: string;
  status_color: string | null;
  due_date: string | null;
  days: number;
  recipient_profile_id: string | null;
};

const KIND_LABEL: Record<NotificationKind, string> = {
  overdue_stage: "Просрочен этап",
  overdue_request: "Просрочена заявка",
  due_soon: "Скоро срок",
  no_response: "Нет ответа",
  no_executor: "Нет исполнителя",
  on_review: "На проверке",
  status_ask: "Запрос статуса",
  stage_message_reply: "Ответ в переписке",
  stage_status_reply: "Статус по этапу",
  stage_message_mention: "Вас упомянули",
  password_reset: "Сброс пароля",
};

export function notificationKindLabel(kind: NotificationKind) {
  return KIND_LABEL[kind] ?? kind;
}

export function notificationOpensMessages(kind: NotificationKind) {
  return (
    kind === "status_ask" ||
    kind === "stage_message_reply" ||
    kind === "stage_status_reply" ||
    kind === "stage_message_mention"
  );
}

function isNotificationKind(k: string): k is NotificationKind {
  return k in KIND_LABEL;
}

function eventsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("v_notification_events");
}

function mapRow(r: EventRow, unread: boolean): NotificationItem {
  const kind = isNotificationKind(r.kind) ? r.kind : "overdue_stage";
  const entityType =
    r.entity_type === "request" ? "request" : r.entity_type === "profile" ? "profile" : "stage";
  return {
    eventKey: r.event_key,
    kind,
    objectId: r.object_id,
    objectName: r.object_name,
    entityType,
    entityId: r.entity_id,
    title: r.title,
    status: r.status,
    statusColor: r.status_color,
    dueDate: r.due_date,
    days: Number(r.days) || 0,
    unread,
  };
}

/** Лента + непрочитанные для колокольчика. */
export function useNotifications(limit = 40) {
  const me = useProfile();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, me.id, me.is_admin, limit],
    refetchInterval: 60_000,
    queryFn: async () => {
      let eq = eventsTable()
        .select(
          "event_key, kind, object_id, object_name, entity_type, entity_id, title, status, status_color, due_date, days, recipient_profile_id",
        )
        .order("days", { ascending: false })
        .limit(Math.max(limit * 3, 120));

      if (!me.is_admin) {
        eq = eq.eq("recipient_profile_id", me.id);
      }

      const { data: events, error } = await eq;
      if (error) throw error;
      const rows = (events ?? []) as EventRow[];

      const { data: reads, error: rErr } = await supabase
        .from("notification_reads")
        .select("event_key")
        .eq("profile_id", me.id);
      if (rErr) throw rErr;
      const readSet = new Set((reads ?? []).map((r) => r.event_key as string));

      const mapped = rows.map((r) => mapRow(r, !readSet.has(r.event_key)));

      // Непрочитанные сообщения/статусы и запросы — выше просрочек по |days|=0
      mapped.sort((a, b) => {
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        const aMsg =
          a.kind === "status_ask" ||
          a.kind === "stage_message_reply" ||
          a.kind === "stage_status_reply" ||
          a.kind === "stage_message_mention" ||
          a.kind === "password_reset";
        const bMsg =
          b.kind === "status_ask" ||
          b.kind === "stage_message_reply" ||
          b.kind === "stage_status_reply" ||
          b.kind === "stage_message_mention" ||
          b.kind === "password_reset";
        if (aMsg !== bMsg) return aMsg ? -1 : 1;
        return Math.abs(b.days) - Math.abs(a.days);
      });
      return {
        items: mapped.slice(0, limit),
        allKeys: mapped.map((i) => i.eventKey),
        unreadCount: mapped.filter((i) => i.unread).length,
      };
    },
  });

  const markRead = useMutation({
    mutationFn: async (keys: string[]) => {
      if (keys.length === 0) return;
      const askIds = keys
        .filter((k) => k.startsWith("status_ask:"))
        .map((k) => k.slice("status_ask:".length));
      const rest = keys.filter((k) => !k.startsWith("status_ask:"));
      for (const id of askIds) {
        const { error } = await supabase.rpc("stage_status_ask_seen", { p_ask_id: id });
        if (error) throw error;
      }
      if (rest.length) {
        const { error } = await supabase.rpc("notification_mark_read", {
          p_event_keys: rest,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  const markSeen = useCallback(
    (keys: string[]) => {
      void markRead.mutateAsync(keys);
    },
    [markRead],
  );

  const markAllSeen = useCallback(() => {
    const keys = q.data?.allKeys ?? [];
    if (keys.length) void markRead.mutateAsync(keys);
  }, [q.data?.allKeys, markRead]);

  const unreadItems = useMemo(
    () => (q.data?.items ?? []).filter((i) => i.unread),
    [q.data?.items],
  );

  return {
    items: unreadItems,
    previewItems: q.data?.items ?? [],
    unseenCount: q.data?.unreadCount ?? 0,
    isLoading: q.isLoading,
    markSeen,
    markAllSeen,
  };
}
