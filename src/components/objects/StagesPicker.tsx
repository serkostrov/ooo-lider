import { Flag } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useStageTemplatesFull, useWorkTypes, type StageTemplate } from "@/components/directories/stages/data";

/** Активные этапы справочника, которые можно добавить (без уже добавленных). */
export function useAvailableTemplates(excludeIds: string[] = []) {
  const { data: all = [], isLoading } = useStageTemplatesFull();
  const ex = new Set(excludeIds);
  return { templates: all.filter((t) => t.is_active && !ex.has(t.id)), isLoading };
}

/** Выбор этапов галочками, сгруппированных по группам (ТЗ 7.3, шаг 3). */
export function StagesPicker({
  templates,
  selected,
  onChange,
}: {
  templates: StageTemplate[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: workTypes = [] } = useWorkTypes();
  const sel = new Set(selected);
  const groups = [
    ...workTypes.map((w) => ({ id: w.id, name: w.name, items: templates.filter((t) => t.work_type_id === w.id) })),
    {
      id: "none",
      name: "Без группы",
      items: templates.filter((t) => !t.work_type_id || !workTypes.some((w) => w.id === t.work_type_id)),
    },
  ].filter((g) => g.items.length > 0);

  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(sel);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(templates.filter((t) => next.has(t.id)).map((t) => t.id));
  };

  return (
    <div className="w-full space-y-4">
      <p className="text-xs text-muted-foreground">
        Номера слева — из справочника. На объекте выбранные этапы получат свою нумерацию 1, 2, 3… по порядку.
      </p>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-background/95 py-2 backdrop-blur-sm">
        <span className="flex-1 text-sm font-semibold">
          Выбрано этапов: {selected.length} из {templates.length}
        </span>
        <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => setMany(templates.map((t) => t.id), true)}>
          Отметить все
        </Button>
        <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => setMany(templates.map((t) => t.id), false)}>
          Снять все
        </Button>
      </div>
      {templates.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Все этапы справочника уже добавлены</p>
      )}
      {groups.map((g) => {
        const ids = g.items.map((t) => t.id);
        const count = ids.filter((id) => sel.has(id)).length;
        const all = count === ids.length;
        return (
          <div key={g.id} className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/60 px-4 py-2">
              <span className="flex-1 text-sm font-semibold">
                {g.name}
                <span className="ml-2 font-normal text-muted-foreground">{count} из {ids.length}</span>
              </span>
              <Button type="button" variant="ghost" className="h-9 text-sm" onClick={() => setMany(ids, !all)}>
                {all ? "Снять группу" : "Отметить группу"}
              </Button>
            </div>
            <div className="divide-y">
              {g.items.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-4 px-4 py-2 text-sm hover:bg-muted/40">
                  <Checkbox className="size-4" checked={sel.has(t.id)} onCheckedChange={(c) => setMany([t.id], c === true)} />
                  <span className="w-8 shrink-0 font-semibold">{t.number}</span>
                  <span className="flex-1">{t.name}</span>
                  {t.is_critical && <Flag className="size-3.5 shrink-0 fill-destructive text-destructive" aria-label="Критичный" />}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
