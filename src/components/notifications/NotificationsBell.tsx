import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOverdueNotifications } from "@/components/overdue/data";
import { cn } from "@/lib/utils";

/**
 * Уведомления в меню: над профилем.
 * «Просмотреть все» помечает текущие как прочитанные — бейдж исчезает.
 */
export function NotificationsBell({
  collapsed = false,
  onNavigate,
}: {
  /** true — только иконка; false — иконка + подпись */
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unseenCount, isLoading, markAllSeen, markSeen } = useOverdueNotifications();
  const count = unseenCount;
  const tip = count > 0 ? `Уведомления · ${count}` : "Уведомления";
  const badge = count > 9 ? "9+" : String(count);

  const openItem = (it: (typeof items)[number]) => {
    markSeen([it.key]);
    setOpen(false);
    onNavigate?.();
    if (it.kind === "request") {
      navigate({ to: "/requests/$requestId", params: { requestId: it.id } });
    } else {
      navigate({
        to: "/objects/$id/stages/$stageId",
        params: { id: it.objectId, stageId: it.id },
      });
    }
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
            {count > 0 ? `Просрочено · ${count}` : "Уведомления"}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {count > 0 ? "Заявки и этапы, требующие внимания" : "Сейчас всё в сроке"}
          </p>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
          ) : count === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Нет просроченных</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {items.map((it) => {
                const what =
                  it.kind === "request" ? `${it.title} — не исполнена` : `${it.title} — срок прошёл`;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left outline-none transition-colors hover:bg-danger-soft/40 focus-visible:bg-danger-soft/40"
                    >
                      <span className="line-clamp-2 text-sm font-medium leading-snug">{what}</span>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{it.objectName}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-danger">
                          {it.days} дн.
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button type="button" variant="ghost" className="h-9 w-full justify-center text-sm" asChild>
            <Link
              to="/overdue"
              onClick={() => {
                markAllSeen();
                setOpen(false);
                onNavigate?.();
              }}
            >
              Просмотреть все
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
