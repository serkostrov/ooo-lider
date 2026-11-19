import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type NotificationItem } from "@/components/notifications/data";
import { NotificationListItem } from "@/components/notifications/NotificationListItem";
import { notificationNavigateOpts } from "@/components/notifications/navigateToNotification";
import { cn } from "@/lib/utils";

/**
 * Уведомления в меню: над профилем.
 * Прочтение пишется в notification_reads (БД).
 */
export function NotificationsBell({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unseenCount, isLoading, markSeen } = useNotifications(30);
  const count = unseenCount;
  const tip = count > 0 ? `Уведомления · ${count}` : "Уведомления";
  const badge = count > 9 ? "9+" : String(count);

  const openItem = (it: NotificationItem) => {
    markSeen([it.eventKey]);
    setOpen(false);
    onNavigate?.();
    void navigate(notificationNavigateOpts(it));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={tip}
          aria-label={tip}
          className={cn(
            "group/item relative flex h-9 w-full items-center rounded-md text-left text-sm transition-colors duration-150",
            "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="inline-flex w-10 shrink-0 items-center justify-center">
            <span className="relative inline-flex size-8 items-center justify-center rounded-md">
              <Bell className="size-[1.125rem] opacity-75 group-hover/item:opacity-100" />
              {count > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[8px] font-bold leading-none tabular-nums text-danger-foreground"
                >
                  {badge}
                </span>
              )}
            </span>
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate">Уведомления</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        sideOffset={8}
        className="flex w-[min(100vw-1.5rem,24rem)] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold tracking-tight">
            {count > 0 ? `Уведомления · ${count}` : "Уведомления"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {count > 0 ? "Сроки, проверка, исполнители и заявки" : "Сейчас всё спокойно"}
          </p>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
          ) : count === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Нет новых уведомлений</p>
          ) : (
            <ul>
              {items.map((it) => (
                <li key={it.eventKey}>
                  <NotificationListItem
                    dense
                    item={it}
                    onOpen={() => openItem(it)}
                    onMarkRead={() => markSeen([it.eventKey])}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-1 border-t border-border p-2 sm:grid-cols-2">
          <Button type="button" variant="ghost" className="h-9 justify-center gap-1.5 text-sm" asChild>
            <Link
              to="/notifications"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <Expand className="size-3.5 shrink-0" />
              Все уведомления
            </Link>
          </Button>
          <Button type="button" variant="ghost" className="h-9 justify-center text-sm" asChild>
            <Link
              to="/overdue"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              Просрочка
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
