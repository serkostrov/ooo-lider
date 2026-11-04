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
import { OBJECTS_KEY, OBJECT_TYPES_KEY, useObjectTypes, useObjects, type ObjectType } from "@/components/objects/data";
import { thLabelClass } from "@/lib/ui";
import { Reorderable } from "./stages/Reorderable";
import { EditSheet, Field, FormActions } from "./common";

type Item = ObjectType & { id: string };

/**
 * Справочник «Типы объектов» (правка 2.5, db/07): варианты для поля «Тип объекта»
 * в карточке объекта и фильтра в списке объектов, в этом же порядке.
 */
export function ObjectTypesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const { active, isLoading } = useObjectTypes();
  const { data: objects = [] } = useObjects();
  const [editing, setEditing] = useState<ObjectType | "new" | null>(null);

  const items: Item[] = active.map((t) => ({ ...t, id: t.code }));
  const count = (code: string) => objects.filter((o) => o.object_type === code).length;

  const reorder = useMutation({
    mutationFn: async (codes: string[]) => {
      qc.setQueryData<ObjectType[]>(OBJECT_TYPES_KEY, (old) => {
        const rest = (old ?? []).filter((t) => !codes.includes(t.code));
        return [...codes.map((c, i) => ({ ...(old ?? []).find((t) => t.code === c)!, sort: i + 1 })), ...rest];
      });
      const results = await Promise.all(codes.map((c, i) => supabase.from("object_types").update({ sort: i + 1 }).eq("code", c)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: OBJECT_TYPES_KEY }),
    onError: showError,
  });

  if (isLoading) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Типы объектов</h2>
        {is_admin && (
          <Button onClick={() => setEditing("new")} size="icon" title="Добавить тип" aria-label="Добавить тип">
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Типов объектов пока нет
        </p>
      ) : (
        <Reorderable
          items={items}
          disabled={!is_admin}
          onMove={(codes) => reorder.mutate(codes)}
          header={
            <>
              <div className={`${thLabelClass} w-10 shrink-0`}>№</div>
              <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
            </>
          }
          render={(t, index) => (
            <button
              type="button"
              disabled={!is_admin}
              onClick={() => setEditing(t)}
              className="flex w-full items-center gap-3 p-0 text-left disabled:cursor-default"
            >
              <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
            </button>
          )}
        />
      )}
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый тип объекта" : "Тип объекта"}
      >
        {editing !== null && (
          <ObjectTypeForm
            key={editing === "new" ? "new" : editing.code}
            ot={editing === "new" ? null : editing}
            objectsCount={editing === "new" ? 0 : count(editing.code)}
            nextSort={Math.max(0, ...active.map((t) => t.sort)) + 1}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </div>
  );
}

function ObjectTypeForm({
  ot,
  objectsCount,
  nextSort,
  onClose,
}: {
  ot: ObjectType | null;
  objectsCount: number;
  nextSort: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(ot?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: OBJECT_TYPES_KEY });
    qc.invalidateQueries({ queryKey: OBJECTS_KEY });
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const value = name.trim().replace(/\s+/g, " ");
      // Название уникально в базе, в том числе среди удалённых. Удалённый с тем же названием — восстанавливаем.
      const { data: same, error: e1 } = await supabase
        .from("object_types")
        .select("code, deleted_at")
        .ilike("name", value.replace(/[\\%_]/g, (c) => `\\${c}`));
      if (e1) throw e1;
      const other = (same ?? []).find((r) => r.code !== ot?.code);
      if (other && !other.deleted_at) throw new Error(`Тип «${value}» уже есть`);
      if (other && !ot) {
        const { error } = await supabase
          .from("object_types")
          .update({ name: value, deleted_at: null, sort: nextSort })
          .eq("code", other.code);
        if (error) throw error;
        return;
      }
      if (other) throw new Error(`Название «${value}» было у удалённого типа — выберите другое`);
      const { error } = ot
        ? await supabase.from("object_types").update({ name: value }).eq("code", ot.code)
        : await supabase.from("object_types").insert({ name: value, sort: nextSort });
      if (error) throw error;
    },
    onSuccess: () => done("Сохранено"),
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      // Проверяем ещё раз в базе: объект могли создать, пока форма была открыта
      const { count, error: e1 } = await supabase
        .from("objects")
        .select("id", { count: "exact", head: true })
        .eq("object_type", ot!.code)
        .is("deleted_at", null);
      if (e1) throw e1;
      if (count) throw new Error(`Этот тип у объектов: ${count}. Сначала поменяйте им тип в карточке объекта`);
      const { error } = await supabase
        .from("object_types")
        .update({ deleted_at: new Date().toISOString() })
        .eq("code", ot!.code);
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
        if (!name.trim()) { toast.error("Заполните название"); return; }
        save.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" autoFocus />
      </Field>
      {ot && (
        <p className="text-sm text-muted-foreground">
          Объектов с этим типом: {objectsCount}. Новое название сразу появится у них.
        </p>
      )}
      {ot && objectsCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Удалить можно, когда ни у одного объекта (в том числе в архиве) нет этого типа.
        </p>
      )}
      <FormActions
        pending={save.isPending}
        onCancel={onClose}
        danger={
          ot ? (
            <Button
              type="button"
              variant="outline"
              disabled={objectsCount > 0}
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
            <AlertDialogTitle className="text-base">Удалить тип объекта?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">«{ot?.name}» пропадёт из списка выбора.</AlertDialogDescription>
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
