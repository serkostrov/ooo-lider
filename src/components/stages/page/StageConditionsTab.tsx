import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderInput, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listFiles } from "@/lib/files";
import { showError } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/directories/common";
import { CONDITION_KINDS } from "@/components/directories/stages/data";
import type { ObjectStage, StageCondition } from "../data";
import { FileList, UploadButton } from "./FileButtons";

const KIND_HINT: Record<StageCondition["kind"], string> = {
  check: "",
  file: "нужен файл",
  field: "нужно значение",
};

type CondDraft = {
  title: string;
  kind: StageCondition["kind"];
  is_required: boolean;
  to_id_folder: boolean;
};

export function useStageConditions(stageId: string) {
  return useQuery({
    queryKey: ["stage-conditions", stageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_conditions")
        .select("id, stage_id, title, kind, is_required, to_id_folder, is_done, value_text, sort")
        .eq("stage_id", stageId)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as StageCondition[];
    },
  });
}

type Draft = Record<string, { done: boolean; value?: string | undefined }>;

export type StageConditionsHandle = {
  save: () => Promise<void>;
  reset: () => void;
};

export const StageConditionsTab = forwardRef<
  StageConditionsHandle,
  {
    stage: ObjectStage;
    readOnly?: boolean;
    marking: boolean;
    onChanged: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function StageConditionsTab({ stage, readOnly = false, marking, onChanged, onDirtyChange }, ref) {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const { data: conds = [], isLoading } = useStageConditions(stage.id);
  const canManage = is_admin && !stage.is_closed && !stage.is_excluded && !marking;
  const [editing, setEditing] = useState<StageCondition | "new" | null>(null);
  const fileCondIds = conds.filter((c) => c.kind === "file").map((c) => c.id);
  const filesKey = ["stage-condition-files", stage.id];
  const { data: files = [] } = useQuery({
    queryKey: [...filesKey, fileCondIds.join(",")],
    queryFn: () => listFiles("stage_condition", fileCondIds),
    enabled: fileCondIds.length > 0,
  });

  const [draft, setDraft] = useState<Draft>({});
  const [askField, setAskField] = useState<StageCondition | null>(null);
  const [fieldValue, setFieldValue] = useState("");

  const seedDraft = (list: StageCondition[]) => {
    const next: Draft = {};
    for (const c of list) {
      next[c.id] = { done: c.is_done, value: c.value_text ?? undefined };
    }
    setDraft(next);
  };

  useEffect(() => {
    if (marking) {
      seedDraft(conds);
    } else {
      setDraft({});
      setAskField(null);
    }
    // only react to marking / stage switch; conds refresh mid-edit shouldn't wipe draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marking, stage.id]);

  const dirty = useMemo(() => {
    if (!marking) return false;
    return conds.some((c) => {
      const d = draft[c.id];
      if (!d) return false;
      if (d.done !== c.is_done) return true;
      if (c.kind === "field" && d.done && (d.value ?? "") !== (c.value_text ?? "")) return true;
      return false;
    });
  }, [marking, draft, conds]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async () => {
      for (const c of conds) {
        const d = draft[c.id];
        if (!d) continue;
        const changed =
          d.done !== c.is_done ||
          (c.kind === "field" && d.done && (d.value ?? "") !== (c.value_text ?? ""));
        if (!changed) continue;
        const args: { p_condition_id: string; p_done: boolean; p_value?: string } = {
          p_condition_id: c.id,
          p_done: d.done,
        };
        if (c.kind === "field" && d.done) args.p_value = (d.value ?? "").trim();
        const { error } = await supabase.rpc("stage_condition_set", args);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Условия сохранены");
      setDraft({});
      onChanged();
      qc.invalidateQueries({ queryKey: ["stage-conditions", stage.id] });
    },
    onError: showError,
  });

  useImperativeHandle(
    ref,
    () => ({
      save: () => save.mutateAsync().then(() => undefined),
      reset: () => {
        setDraft({});
        setAskField(null);
      },
    }),
    [save],
  );

  const refreshConds = () => {
    onChanged();
    qc.invalidateQueries({ queryKey: ["stage-conditions", stage.id] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("object_stage_conditions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Условие удалено");
      refreshConds();
    },
    onError: showError,
  });

  if (isLoading) return null;

  if (conds.length === 0) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          У этапа нет условий закрытия.
          {canManage
            ? " Подэтап создаётся пустым — добавьте условия здесь (у этапов из справочника они копируются из шаблона)."
            : ""}
        </p>
        {canManage && (
          <Button type="button" className="h-9 gap-1.5 px-3 text-sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Добавить условие
          </Button>
        )}
        {editing && (
          <ConditionEditDialog
            stageId={stage.id}
            nextSort={1}
            initial={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={refreshConds}
          />
        )}
      </div>
    );
  }

  const required = conds.filter((c) => c.is_required);
  const doneRequired = required.filter((c) => {
    if (marking) return draft[c.id]?.done ?? c.is_done;
    return c.is_done;
  }).length;

  const toggleDraft = (c: StageCondition, done: boolean) => {
    if (done && c.kind === "field") {
      setFieldValue(draft[c.id]?.value ?? c.value_text ?? "");
      setAskField(c);
      return;
    }
    setDraft((prev) => ({
      ...prev,
      [c.id]: { ...prev[c.id], done, value: prev[c.id]?.value },
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Обязательных выполнено:{" "}
          <span className="font-medium text-foreground">
            {doneRequired} из {required.length}
          </span>
          {doneRequired === required.length && required.length > 0 && (
            <span className="ml-2 text-success">— можно отправлять на проверку</span>
          )}
        </p>
        {canManage && (
          <Button type="button" className="h-9 shrink-0 gap-1.5 px-3 text-sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Добавить условие
          </Button>
        )}
      </div>

      {marking && !readOnly && (
        <p className="text-xs text-muted-foreground">
          Отметьте выполненные пункты и нажмите «Сохранить». Без сохранения изменения не запишутся.
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        {conds.map((c) => {
          const condFiles = files.filter((f) => f.entity_id === c.id);
          const done = marking ? (draft[c.id]?.done ?? c.is_done) : c.is_done;
          const valueText = marking ? (draft[c.id]?.value ?? c.value_text) : c.value_text;
          const clickable = marking && !readOnly && !save.isPending;
          const kindLabel = CONDITION_KINDS.find((k) => k.v === c.kind)?.label ?? c.kind;
          const toggle = () => toggleDraft(c, !done);
          const showStatusIcon = marking || done;
          return (
            <li
              key={c.id}
              role={clickable ? "checkbox" : undefined}
              aria-checked={clickable ? done : undefined}
              aria-label={clickable ? c.title : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? toggle : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle();
                      }
                    }
                  : undefined
              }
              className={`outline-none transition-colors ${
                done ? "bg-success-soft/60" : ""
              } ${
                clickable
                  ? "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {showStatusIcon && (
                  <div className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
                    {marking && !readOnly ? (
                      <Checkbox className="pointer-events-none size-4" checked={done} tabIndex={-1} />
                    ) : done ? (
                      <Check className="size-4 text-success" />
                    ) : null}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm leading-snug ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {c.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{kindLabel}</span>
                    {!c.is_required && (
                      <>
                        <span aria-hidden>·</span>
                        <span>необязательное</span>
                      </>
                    )}
                    {KIND_HINT[c.kind] && !done && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{KIND_HINT[c.kind]}</span>
                      </>
                    )}
                    {c.to_id_folder && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1 text-info">
                          <FolderInput className="size-3" /> в папку ИД
                        </span>
                      </>
                    )}
                  </div>
                  {c.kind === "field" && valueText && (
                    <div className="mt-1.5 text-sm">
                      Значение: <span className="font-medium">{valueText}</span>
                    </div>
                  )}
                  {c.kind === "file" && (
                    <div
                      className="mt-2 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <FileList files={condFiles} />
                      {marking && !readOnly && (
                        <UploadButton
                          objectId={stage.object_id}
                          entityType="stage_condition"
                          entityId={c.id}
                          kind="photo"
                          label={condFiles.length ? "Добавить ещё файл" : "Прикрепить файл"}
                          className="h-9 text-sm"
                          onUploaded={() => {
                            qc.invalidateQueries({ queryKey: filesKey });
                            qc.invalidateQueries({ queryKey: ["history"] });
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      title="Изменить"
                      onClick={() => setEditing(c)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="Удалить"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (!window.confirm(`Удалить условие «${c.title}»?`)) return;
                        remove.mutate(c.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!askField} onOpenChange={(o) => !o && setAskField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">{askField?.title}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!askField) return;
              const v = fieldValue.trim();
              if (!v) {
                toast.error("Укажите значение");
                return;
              }
              setDraft((prev) => ({
                ...prev,
                [askField.id]: { done: true, value: v },
              }));
              setAskField(null);
            }}
          >
            <Input
              autoFocus
              value={fieldValue}
              onChange={(e) => setFieldValue(e.target.value)}
              placeholder="Значение"
              className="h-9 text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" className="h-9 flex-1 text-sm">
                Отметить
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1 text-sm"
                onClick={() => setAskField(null)}
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editing && (
        <ConditionEditDialog
          stageId={stage.id}
          nextSort={(conds.at(-1)?.sort ?? 0) + 1}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refreshConds}
        />
      )}
    </div>
  );
});

function ConditionEditDialog({
  stageId,
  nextSort,
  initial,
  onClose,
  onSaved,
}: {
  stageId: string;
  nextSort: number;
  initial: StageCondition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<CondDraft>({
    title: initial?.title ?? "",
    kind: initial?.kind ?? "check",
    is_required: initial?.is_required ?? true,
    to_id_folder: initial?.to_id_folder ?? false,
  });

  const save = useMutation({
    mutationFn: async () => {
      const title = draft.title.trim();
      if (!title) throw new Error("Укажите название");
      if (initial) {
        const { error } = await supabase
          .from("object_stage_conditions")
          .update({
            title,
            kind: draft.kind,
            is_required: draft.is_required,
            to_id_folder: draft.to_id_folder,
          })
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("object_stage_conditions").insert({
          stage_id: stageId,
          title,
          kind: draft.kind,
          is_required: draft.is_required,
          to_id_folder: draft.to_id_folder,
          sort: nextSort,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Условие сохранено" : "Условие добавлено");
      onSaved();
      onClose();
    },
    onError: showError,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{initial ? "Изменить условие" : "Новое условие"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Название" required>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="h-9 text-sm"
              autoFocus
            />
          </Field>
          <Field label="Тип">
            <Select
              value={draft.kind}
              onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as StageCondition["kind"] }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_KINDS.map((k) => (
                  <SelectItem key={k.v} value={k.v} className="text-sm">
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Обязательное</span>
            <Switch
              checked={draft.is_required}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, is_required: v }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>В папку ИД</span>
            <Switch
              checked={draft.to_id_folder}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, to_id_folder: v }))}
            />
          </label>
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              className="h-9 px-4 text-sm"
              disabled={save.isPending || !draft.title.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
            <Button type="button" variant="outline" className="h-9 text-sm" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
