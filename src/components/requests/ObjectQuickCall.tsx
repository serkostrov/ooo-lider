import { useMemo, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { useRequests } from "@/components/requests/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/profile";
import { canCreateRequest } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NewRequestDialog } from "./NewRequestDialog";

/**
 * Кнопки видов заявок слева на странице объекта (ТЗ 7.4).
 * Десктоп: список видов (фильтр + «+»).
 * Мобилка: «Создать заявку» → выбор вида → форма.
 */
export function ObjectRequestTypeButtons({
  objectId,
  activeTypeId,
  onSelectType,
}: {
  objectId: string;
  activeTypeId?: string | undefined;
  /** Повторный клик по активному виду снимает фильтр. */
  onSelectType: (typeId: string | undefined) => void;
}) {
  const me = useProfile();
  const allowCreate = canCreateRequest(me);
  const { data: types = [], isLoading } = useRequestTypes();
  const { data: requests = [] } = useRequests(objectId);
  const active = useMemo(() => types.filter((t) => t.is_active), [types]);
  const [createTypeId, setCreateTypeId] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const badges = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (!r.is_new && !r.is_overdue) continue;
      map.set(r.request_type_id, (map.get(r.request_type_id) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  const openCreate = (typeId: string) => {
    setPickerOpen(false);
    setCreateTypeId(typeId);
    setCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Вызовы
        </p>
        <div className="lg:hidden">
          <Skeleton height={36} borderRadius={6} className="w-full" />
        </div>
        <div className="hidden flex-col gap-1.5 lg:flex">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={36} borderRadius={6} className="w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (active.length === 0) return null;

  return (
    <>
      <NewRequestDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setCreateTypeId(undefined);
        }}
        objectId={objectId}
        typeId={createTypeId}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="pr-8 text-lg font-semibold tracking-tight">
              Вид заявки
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-2">
            {active.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openCreate(t.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Мобилка: одна кнопка создания */}
      {allowCreate ? (
        <div className="flex flex-col gap-1.5 lg:hidden">
          <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Вызовы
          </p>
          <Button
            type="button"
            className="h-10 w-full gap-2 text-sm"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-4" />
            Создать заявку
          </Button>
        </div>
      ) : null}

      {/* Десктоп: список видов */}
      <div className="hidden flex-col gap-1.5 lg:flex">
        <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Вызовы
        </p>
        <div className="flex flex-col gap-1.5">
          {active.map((t) => {
            const count = badges.get(t.id) ?? 0;
            const selected = activeTypeId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "inline-flex h-auto w-full items-stretch overflow-hidden rounded-md border",
                  selected ? "border-primary bg-primary/15" : "border-border bg-card",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectType(selected ? undefined : t.id)}
                  title={selected ? "Снять фильтр по виду" : `Показать заявки: ${t.name}`}
                  className={cn(
                    "relative min-h-9 min-w-0 flex-1 px-2.5 py-2 text-left text-sm font-medium transition-colors",
                    selected ? "text-foreground" : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="block line-clamp-2 pr-6 leading-snug">{t.name}</span>
                  {count > 0 && (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-danger px-1 text-[10px] font-bold tabular-nums text-danger-foreground">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </button>
                {allowCreate ? (
                  <button
                    type="button"
                    title={`Новая заявка: ${t.name}`}
                    aria-label={`Новая заявка: ${t.name}`}
                    className="inline-flex w-9 shrink-0 items-center justify-center self-stretch border-l border-border/80 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    onClick={() => openCreate(t.id)}
                  >
                    <Plus className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** @deprecated используйте ObjectRequestTypeButtons */
export function ObjectQuickCall({ objectId }: { objectId: string }) {
  return (
    <ObjectRequestTypeButtons
      objectId={objectId}
      onSelectType={() => undefined}
    />
  );
}
