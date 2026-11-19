import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  notificationKindLabel,
  useNotifications,
  type NotificationKind,
} from "@/components/notifications/data";
import { NotificationListItem } from "@/components/notifications/NotificationListItem";
import { notificationNavigateOpts } from "@/components/notifications/navigateToNotification";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Уведомления — Лидер" },
      { name: "description", content: "Все уведомления по этапам и заявкам" },
    ],
  }),
});

const ALL = "__all";
type Scope = "unread" | "all";

function NotificationsPage() {
  const navigate = useNavigate();
  const { previewItems, unseenCount, isLoading, markSeen, markAllSeen } = useNotifications(200);
  const [scope, setScope] = useState<Scope>("unread");
  const [kind, setKind] = useState<string>(ALL);

  const kinds = useMemo(() => {
    const map = new Map<NotificationKind, number>();
    for (const it of previewItems) {
      map.set(it.kind, (map.get(it.kind) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([k, n]) => ({ kind: k, count: n }))
      .sort((a, b) => notificationKindLabel(a.kind).localeCompare(notificationKindLabel(b.kind), "ru"));
  }, [previewItems]);

  const filtered = useMemo(() => {
    return previewItems.filter((it) => {
      if (scope === "unread" && !it.unread) return false;
      if (kind !== ALL && it.kind !== kind) return false;
      return true;
    });
  }, [previewItems, scope, kind]);

  const unreadInFilter = filtered.filter((i) => i.unread).length;

  return (
    <PageFrame
      header={
        <PageHeader
          title="Уведомления"
          description={
            unseenCount > 0
              ? `Непрочитанных: ${unseenCount}. Можно открыть карточку или отметить прочитанным.`
              : "Нет новых уведомлений — ниже можно смотреть все события."
          }
          actions={
            unseenCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1.5 text-sm"
                onClick={() => markAllSeen()}
              >
                <CheckCheck className="size-4" />
                Прочитать все
              </Button>
            ) : undefined
          }
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList className={`${tabsListClass} mb-0`}>
              <TabsTrigger value="unread" className={tabTriggerClass}>
                Новые ({unseenCount})
              </TabsTrigger>
              <TabsTrigger value="all" className={tabTriggerClass}>
                Все ({previewItems.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-56" aria-label="Тип уведомления">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-sm">
                Все типы
              </SelectItem>
              {kinds.map((k) => (
                <SelectItem key={k.kind} value={k.kind} className="text-sm">
                  {notificationKindLabel(k.kind)} ({k.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-card shadow-[var(--surface-glow)]">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">
              {scope === "unread" ? "Нет непрочитанных уведомлений" : "Нет уведомлений по фильтру"}
            </p>
          ) : (
            <>
              {scope === "unread" && unreadInFilter > 0 ? (
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
                  <span>
                    Показано {filtered.length}
                    {kind !== ALL ? " · фильтр по типу" : ""}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => markSeen(filtered.filter((i) => i.unread).map((i) => i.eventKey))}
                  >
                    Отметить эти прочитанными
                  </button>
                </div>
              ) : null}
              <ul>
                {filtered.map((it) => (
                  <li key={it.eventKey}>
                    <NotificationListItem
                      item={it}
                      onOpen={() => {
                        if (it.unread) markSeen([it.eventKey]);
                        void navigate(notificationNavigateOpts(it));
                      }}
                      onMarkRead={it.unread ? () => markSeen([it.eventKey]) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </PageFrame>
  );
}
