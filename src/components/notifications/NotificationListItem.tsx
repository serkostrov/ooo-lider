import { Check } from "lucide-react";
import {
  notificationKindLabel,
  type NotificationItem,
} from "@/components/notifications/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationListItem({
  item,
  onOpen,
  onMarkRead,
  dense = false,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onMarkRead?: (() => void) | undefined;
  dense?: boolean;
}) {
  const overdue =
    item.kind === "overdue_stage" ||
    item.kind === "overdue_request" ||
    item.kind === "no_response";

  return (
    <div
      className={cn(
        "group flex items-start gap-2 border-b border-border/70 last:border-b-0",
        dense ? "px-4 py-3" : "px-4 py-3.5 sm:px-5",
        item.unread ? "bg-primary/[0.04]" : undefined,
        overdue ? "hover:bg-danger-soft/30" : "hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 flex-col gap-1 text-left outline-none"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {notificationKindLabel(item.kind)}
          </span>
          {item.unread ? (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              новое
            </span>
          ) : null}
        </div>
        <div className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</div>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{item.objectName}</span>
          {overdue && item.days > 0 ? (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-danger">
              {item.days} дн.
            </span>
          ) : null}
          {item.kind === "due_soon" ? (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">
              через {Math.max(item.days, 0)} дн.
            </span>
          ) : null}
        </div>
      </button>
      {item.unread && onMarkRead ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Отметить прочитанным"
          aria-label="Отметить прочитанным"
          className="mt-0.5 size-8 shrink-0 px-0 text-muted-foreground opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead();
          }}
        >
          <Check className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
