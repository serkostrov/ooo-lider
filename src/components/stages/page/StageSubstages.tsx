import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/directories/common";
import { ReorderModeButton } from "@/components/directories/ReorderModeButton";
import { Reorderable } from "@/components/directories/stages/Reorderable";
import { StatusBadge, useObjectStages, useRefreshStages, type ObjectStage } from "../data";

/** Блок подэтапов на карточке родительского этапа. */
export function StageSubstages({
  objectId,
  parent,
}: {
  objectId: string;
  parent: ObjectStage;
}) {
  const { is_admin } = useProfile();
  const refresh = useRefreshStages();
  const { data: stages = [] } = useObjectStages(objectId);
  const children = stages.filter((s) => s.parent_id === parent.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reordering, setReordering] = useState(false);

  const add = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("Укажите название");
      const { data, error } = await supabase.rpc("add_object_substage", {
        p_parent_id: parent.id,
        p_name: n,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Подэтап добавлен");
      setOpen(false);
      setName("");
      refresh(objectId, parent.id);
    },
    onError: showError,
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc("reorder_object_stages", {
        p_object_id: objectId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onSuccess: () => refresh(objectId, parent.id),
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async (stageId: string) => {
      const { error } = await supabase.rpc("delete_object_stage", { p_stage_id: stageId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Подэтап удалён");
      refresh(objectId, parent.id);
    },
    onError: showError,
  });

  if (parent.parent_id) return null;

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Подэтапы</h2>
        {is_admin && (
          <div className="flex shrink-0 items-center gap-2">
            {children.length > 1 && (
              <ReorderModeButton
                active={reordering}
                onChange={setReordering}
                disabled={reorder.isPending}
              />
            )}
            <Button type="button" size="icon" className="size-8" onClick={() => setOpen(true)} title="Добавить подэтап">
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {reordering
          ? "Перетащите подэтапы за ручку. Номера пересчитаются сами."
          : `Подэтапы нумеруются как ${parent.code}.1, ${parent.code}.2… и ведут себя как обычные этапы (статус, заявки, условия).`}
      </p>

      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет подэтапов</p>
      ) : (
        <Reorderable
          items={children}
          disabled={!is_admin || !reordering || reorder.isPending}
          onMove={(ids) => reorder.mutate(ids)}
          render={(s) => (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-sm">
              <Link
                to="/objects/$id/stages/$stageId"
                params={{ id: objectId, stageId: s.id }}
                className="w-12 shrink-0 font-semibold tabular-nums text-muted-foreground hover:text-primary"
              >
                {s.code}
              </Link>
              <Link
                to="/objects/$id/stages/$stageId"
                params={{ id: objectId, stageId: s.id }}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {s.name}
              </Link>
              <StatusBadge name={s.status_name} color={s.status_color} />
              {is_admin && !reordering && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  disabled={remove.isPending}
                  title="Удалить подэтап"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      !window.confirm(
                        s.conditions_total > 0 || s.status_code !== "not_started"
                          ? `Удалить подэтап ${s.code} «${s.name}»? Если есть заявки — удаление будет запрещено.`
                          : `Удалить подэтап ${s.code} «${s.name}»?`,
                      )
                    ) {
                      return;
                    }
                    remove.mutate(s.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Новый подэтап</DialogTitle>
          </DialogHeader>
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" autoFocus />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              className="h-9 px-4 text-sm"
              disabled={add.isPending || !name.trim()}
              onClick={() => add.mutate()}
            >
              {add.isPending ? "Создание…" : "Создать"}
            </Button>
            <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
