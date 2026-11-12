import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { thLabelClass } from "@/lib/ui";
import { Reorderable } from "./stages/Reorderable";
import { ReorderModeButton } from "./ReorderModeButton";
import { STAGES_KEY, useStageTemplatesFull, useWorkTypes } from "./stages/data";
import { EditSheet, Field, FormActions } from "./common";
import { DirectoryListSkeleton, directoryListHeader } from "./DirectorySkeleton";
import { escapeIlike, normalizeDirectoryName, validateNamedDirectoryItem } from "./rules";

/** Тот же ключ, что у useWorkTypes: список обновляется и в карточке этапа, и в мастере объекта. */
const KEY = ["dir-work-types"];
type WorkType = { id: string; name: string; sort: number };

/**
 * Справочник «Группы» (правка раунда 2): группы этапов.
 * Порядок здесь = порядок групп в справочнике этапов, в мастере объекта и в таблице этапов.
 */
export function WorkTypesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useWorkTypes();
  const { data: stages = [] } = useStageTemplatesFull();
  const [editing, setEditing] = useState<WorkType | "new" | null>(null);
  const [reordering, setReordering] = useState(false);

  const count = (id: string) => stages.filter((s) => s.work_type_id === id).length;

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      qc.setQueryData<WorkType[]>(KEY, (old) => ids.map((id, i) => ({ ...(old ?? []).find((t) => t.id === id)!, sort: i + 1 })));
      const results = await Promise.all(ids.map((id, i) => supabase.from("work_types").update({ sort: i + 1 }).eq("id", id)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: showError,
  });

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Группы</h2>
        {is_admin && (
          <div className="flex shrink-0 items-center gap-2">
            <ReorderModeButton active={reordering} onChange={setReordering} />
            <Button onClick={() => setEditing("new")} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="size-4" />
              Добавить группу
            </Button>
          </div>
        )}
      </div>
      {isLoading ? (
        <DirectoryListSkeleton
          withActions={is_admin && reordering}
          header={directoryListHeader(["№", "Название"])}
        />
      ) : types.length === 0 ? (
        <p className="rounded-md border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Групп пока нет
        </p>
      ) : (
        <Reorderable
          items={types}
          disabled={!is_admin || !reordering}
          onMove={(ids) => reorder.mutate(ids)}
          {...(is_admin ? { onRowClick: (t: (typeof types)[number]) => setEditing(t) } : {})}
          header={
            <>
              <div className={`${thLabelClass} w-10 shrink-0`}>№</div>
              <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
            </>
          }
          render={(t, index) => (
            <>
              <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
            </>
          )}
        />
      )}
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новая группа" : "Группа"}
      >
        {editing !== null && (
          <WorkTypeForm
            key={editing === "new" ? "new" : editing.id}
            wt={editing === "new" ? null : editing}
            stagesCount={editing === "new" ? 0 : count(editing.id)}
            nextSort={Math.max(0, ...types.map((t) => t.sort)) + 1}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </div>
  );
}

function WorkTypeForm({
  wt,
  stagesCount,
  nextSort,
  onClose,
}: {
  wt: WorkType | null;
  stagesCount: number;
  nextSort: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(wt?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: STAGES_KEY });
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const value = normalizeDirectoryName(name);
      // Название уникально в базе, в том числе среди удалённых. Удалённый с тем же названием — восстанавливаем.
      const { data: same, error: e1 } = await supabase
        .from("work_types")
        .select("id, deleted_at")
        .ilike("name", escapeIlike(value));
      if (e1) throw e1;
      const other = (same ?? []).find((r) => r.id !== wt?.id);
      if (other && !other.deleted_at) throw new Error(`Вид работ «${value}» уже есть`);
      if (other && !wt) {
        const { error } = await supabase.from("work_types").update({ name: value, deleted_at: null, sort: nextSort }).eq("id", other.id);
        if (error) throw error;
        return;
      }
      if (other) throw new Error(`Название «${value}» было у удалённой группы — выберите другое`);
      const { error } = wt
        ? await supabase.from("work_types").update({ name: value }).eq("id", wt.id)
        : await supabase.from("work_types").insert({ name: value, sort: nextSort });
      if (error) throw error;
    },
    onSuccess: () => done("Сохранено"),
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      // Проверяем ещё раз на сервере: этапы могли добавить, пока форма была открыта
      const { count, error: e1 } = await supabase
        .from("stage_templates")
        .select("id", { count: "exact", head: true })
        .eq("work_type_id", wt!.id)
        .is("deleted_at", null);
      if (e1) throw e1;
      if (count) throw new Error(`К группе привязано этапов: ${count}. Сначала переведите их в другую группу`);
      const { error } = await supabase.from("work_types").update({ deleted_at: new Date().toISOString() }).eq("id", wt!.id);
      if (error) throw error;
    },
    onSuccess: () => done("Удалено"),
    onError: (e) => {
      setConfirmDelete(false);
      showError(e);
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const err = validateNamedDirectoryItem(name);
        if (err) {
          toast.error(err);
          return;
        }
        save.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" autoFocus />
      </Field>
      {wt && (
        <p className="text-sm text-muted-foreground">
          Этапов в справочнике с этой группой: {stagesCount}. Новое название сразу появится у них и на объектах.
        </p>
      )}
      {wt && stagesCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Удалить можно, когда к группе не привязано ни одного этапа: переведите их в другую группу в карточке этапа.
        </p>
      )}
      <FormActions
        pending={save.isPending}
        onCancel={onClose}
        danger={
          wt ? (
            <Button
              type="button"
              variant="outline"
              disabled={stagesCount > 0}
              onClick={() => setConfirmDelete(true)}
              size="icon"
              className="shrink-0 text-destructive"
              title="Удалить"
              aria-label="Удалить"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : undefined
        }
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить группу?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              «{wt?.name}» пропадёт из списка. На уже созданных объектах этапы останутся как есть.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-sm">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 bg-destructive text-sm text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
