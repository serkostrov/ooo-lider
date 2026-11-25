import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ObjectStage } from "@/components/stages/data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function cellTone(s: ObjectStage): string {
  if (s.is_excluded) return "border-muted bg-muted/50 text-muted-foreground";
  if (s.is_closed) return "border-sky-500/50 bg-sky-600 text-white";
  if (s.is_overdue) return "border-danger bg-danger-soft text-danger";
  if (s.status_code === "on_review")
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s.is_due_soon) return "border-warning/50 bg-warning-soft text-warning";
  if (!s.is_closed && s.status_code && s.status_code !== "not_started") {
    return "border-sky-400/40 bg-sky-500/15 text-sky-700 dark:text-sky-300";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function stageStatusLabel(s: ObjectStage): string | null {
  if (s.is_excluded) return "исключён";
  if (s.is_closed) return "закрыто";
  if (s.is_overdue) return "просрочено";
  if (s.status_code === "on_review") return "на проверке";
  if (s.is_due_soon) return "скоро срок";
  if (!s.is_closed && s.status_code && s.status_code !== "not_started") return "в работе";
  return "не начато";
}

/**
 * Компактная «трасса» топ-этапов: квадратики с номерами (как на дашборде объекта).
 */
export function ObjectRouteStrip({
  objectId,
  stages,
  className,
}: {
  objectId: string;
  stages: ObjectStage[];
  className?: string;
}) {
  const tops = stages
    .filter((s) => !s.parent_id)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.number - b.number);

  if (tops.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">Нет этапов для трассы</p>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-3", className)}>
        <div className="flex flex-wrap gap-1.5">
          {tops.map((s) => {
            const code = s.code || String(s.number);
            const status = stageStatusLabel(s);
            return (
              <Tooltip key={s.id}>
                <TooltipTrigger asChild>
                  <Link
                    to="/objects/$id/stages/$stageId"
                    params={{ id: objectId, stageId: s.id }}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums transition-transform hover:scale-105 sm:size-9 sm:text-xs",
                      cellTone(s),
                    )}
                  >
                    {code}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
                >
                  <p className="text-xs font-medium leading-snug">
                    {code}. {s.name}
                  </p>
                  {status ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{status}</p>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-sky-500/50 bg-sky-600" />
            закрыто
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-sky-400/40 bg-sky-500/15" />
            в работе
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-emerald-500/40 bg-emerald-500/15" />
            на проверке
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-danger bg-danger-soft" />
            просрочено
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-border bg-muted/30" />
            не начато
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
