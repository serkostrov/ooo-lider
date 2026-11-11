import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { useRequests } from "@/components/requests/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NewRequestDialog } from "./NewRequestDialog";

/**
 * Кнопки видов заявок слева на странице объекта (ТЗ 7.4).
 * Бейдж = новые + просроченные по виду. Клик — фильтр заявок; «+» — создать.
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
  const { data: types = [] } = useRequestTypes();
  const { data: requests = [] } = useRequests(objectId);
  const active = useMemo(() => types.filter((t) => t.is_active), [types]);
  const [createTypeId, setCreateTypeId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const badges = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests) {
      if (!r.is_new && !r.is_overdue) continue;
      map.set(r.request_type_id, (map.get(r.request_type_id) ?? 0) + 1);
    }
    return map;
  }, [requests]);

  if (active.length === 0) return null;

  return (
    <>
      <NewRequestDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setCreateTypeId(undefined);
        }}
        objectId={objectId}
        typeId={createTypeId}
      />
      <div className="flex flex-col gap-1.5">
        <p className="px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Вызовы
        </p>
        {active.map((t) => {
          const count = badges.get(t.id) ?? 0;
          const selected = activeTypeId === t.id;
          return (
            <div key={t.id} className="flex gap-1">
              <button
                type="button"
                onClick={() => onSelectType(selected ? undefined : t.id)}
                title={selected ? "Снять фильтр по виду" : `Показать заявки: ${t.name}`}
                className={cn(
                  "relative min-h-9 flex-1 rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/60",
                )}
              >
                <span className="pr-6 leading-snug">{t.name}</span>
                {count > 0 && (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-danger-foreground">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                title={`Новая заявка: ${t.name}`}
                aria-label={`Новая заявка: ${t.name}`}
                onClick={() => {
                  setCreateTypeId(t.id);
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          );
        })}
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
