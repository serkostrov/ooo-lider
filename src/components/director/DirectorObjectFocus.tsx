import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useObjectStages } from "@/components/stages/data";
import { ObjectRouteStrip } from "@/components/stages/ObjectRouteStrip";
import {
  formatDue,
  type DirectorProblems,
  type ObjectProgress,
} from "@/components/director/data";
import { contractDaysLeftValue, contractTone } from "@/components/objects/data";
import { formatDate } from "@/lib/format";

type StatCard = {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning" | "info" | "neutral";
};

const toneClass = {
  neutral: "border-border/70 bg-card",
  danger: "border-danger/25 bg-danger-soft/35",
  warning: "border-warning/25 bg-warning-soft/40",
  info: "border-primary/20 bg-primary/5",
} as const;

export function DirectorObjectFocus({
  objects,
  problems,
  loading,
  selectedObjectId,
}: {
  objects: ObjectProgress[] | undefined;
  problems: DirectorProblems | undefined;
  loading: boolean;
  /** Id из URL (?object=). Пусто — берём первый объект. */
  selectedObjectId: string | null;
}) {
  const navigate = useNavigate();
  const list = objects ?? [];

  const objectId = useMemo(() => {
    if (selectedObjectId && list.some((o) => o.id === selectedObjectId)) {
      return selectedObjectId;
    }
    return list[0]?.id ?? "";
  }, [list, selectedObjectId]);

  useEffect(() => {
    if (!list.length || !objectId) return;
    if (selectedObjectId === objectId) return;
    void navigate({
      to: "/director",
      search: (prev) => ({ ...prev, object: objectId }),
      replace: true,
    });
  }, [list.length, objectId, selectedObjectId, navigate]);

  const setObjectId = (id: string) => {
    void navigate({
      to: "/director",
      search: (prev) => ({ ...prev, object: id }),
    });
  };

  const selected = list.find((o) => o.id === objectId) ?? null;
  const { data: stages = [], isLoading: stagesLoading } = useObjectStages(objectId);

  const objectOverdue = useMemo(() => {
    if (!problems || !objectId) return [];
    return [...problems.stagesOverdue, ...problems.requestsOverdue]
      .filter((i) => i.objectId === objectId)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 10);
  }, [problems, objectId]);

  const endTone = contractTone(selected?.contractDaysLeft);
  const cards: StatCard[] = selected
    ? [
        {
          label: "До окончания",
          value: contractDaysLeftValue(selected.contractDaysLeft),
          ...(selected.contractEnd
            ? { hint: `до ${formatDate(selected.contractEnd)}` }
            : {}),
          tone: endTone === "bad" ? "danger" : endTone === "warn" ? "warning" : "info",
        },
        {
          label: "Закрыто этапов",
          value: `${selected.stagesClosed} / ${selected.stagesTotal}`,
          tone: "neutral",
        },
        {
          label: "Готовность",
          value: `${selected.progressPct}%`,
          tone: "info",
        },
        {
          label: "Просрочено",
          value: String(selected.stagesOverdue + selected.requestsOverdue),
          tone: selected.stagesOverdue + selected.requestsOverdue > 0 ? "danger" : "neutral",
        },
        {
          label: "Нет ответа в срок",
          value: String(selected.stagesNoResponse),
          tone: selected.stagesNoResponse > 0 ? "warning" : "neutral",
        },
        {
          label: "Ждут приёмки",
          value: String(selected.stagesOnReview),
          tone: selected.stagesOnReview > 0 ? "info" : "neutral",
        },
        {
          label: "Без исполнителя",
          value: String(selected.stagesNoExecutor),
          tone: selected.stagesNoExecutor > 0 ? "warning" : "neutral",
        },
      ]
    : [];

  return (
    <section
      id="director-object-focus"
      className="scroll-mt-4 rounded-xl border border-border/70 bg-card p-4 shadow-[var(--surface-glow)] sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Трасса объекта</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Выберите объект — статистика и квадратики этапов. Клик по номеру открывает этап.
          </p>
        </div>
        {selected && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
            <Link to="/objects/$id" params={{ id: selected.id }}>
              Открыть объект
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Нет объектов в работе</p>
      ) : (
        <div className="space-y-4">
          <div className="flex max-w-xl items-center gap-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <Select value={objectId} onValueChange={setObjectId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Объект" />
              </SelectTrigger>
              <SelectContent>
                {list.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-sm">
                    {o.name}
                    {o.contractDaysLeft != null
                      ? ` · ${o.contractDaysLeft < 0 ? `−${-o.contractDaysLeft}` : o.contractDaysLeft} дн.`
                      : ""}
                    {o.stagesOverdue + o.requestsOverdue > 0
                      ? ` · просроч. ${o.stagesOverdue + o.requestsOverdue}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                {cards.map((c) => (
                  <div
                    key={c.label}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      toneClass[c.tone ?? "neutral"],
                    )}
                  >
                    <p className="text-[11px] text-muted-foreground">{c.label}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                      {c.value}
                      {c.label === "До окончания" && c.value !== "—" ? (
                        <span className="ml-0.5 text-sm font-medium opacity-70">дн.</span>
                      ) : null}
                    </p>
                    {c.hint ? (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.hint}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Этапы
                </p>
                {stagesLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <ObjectRouteStrip objectId={selected.id} stages={stages} />
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Просрочено по объекту
                </p>
                {objectOverdue.length === 0 ? (
                  <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Нет просроченных этапов и заявок
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                    {objectOverdue.map((item) => (
                      <li
                        key={item.key}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.kind === "stage" ? "этап" : "заявка"}
                            {item.responsible ? ` · ${item.responsible}` : ""}
                            {item.dueDate ? ` · срок ${formatDue(item.dueDate)}` : ""}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
                          <Link
                            to={
                              item.kind === "stage"
                                ? "/objects/$id/stages/$stageId"
                                : "/requests/$requestId"
                            }
                            params={
                              item.kind === "stage"
                                ? { id: item.objectId, stageId: item.id }
                                : { requestId: item.id }
                            }
                          >
                            Открыть
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
