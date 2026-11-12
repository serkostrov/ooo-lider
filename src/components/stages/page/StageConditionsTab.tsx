import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderInput } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listFiles } from "@/lib/files";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ObjectStage, StageCondition } from "../data";
import { FileList, UploadButton } from "./FileButtons";

const KIND_HINT: Record<StageCondition["kind"], string> = {
  check: "",
  file: "нужен файл",
  field: "нужно значение",
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
  const qc = useQueryClient();
  const { data: conds = [], isLoading } = useStageConditions(stage.id);
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

  if (isLoading) return null;
  if (conds.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">У этапа нет условий закрытия</p>;
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
    <div className="space-y-4">
      <p className="text-sm">
        Обязательных выполнено:{" "}
        <span className="font-semibold">
          {doneRequired} из {required.length}
        </span>
        {doneRequired === required.length && required.length > 0 && (
          <span className="ml-2 text-success">— можно отправлять на проверку</span>
        )}
      </p>

      {marking && !readOnly && (
        <p className="text-xs text-muted-foreground">
          Отметьте выполненные пункты и нажмите «Сохранить». Без сохранения изменения не запишутся.
        </p>
      )}

      <ul className="space-y-3">
        {conds.map((c) => {
          const condFiles = files.filter((f) => f.entity_id === c.id);
          const done = marking ? (draft[c.id]?.done ?? c.is_done) : c.is_done;
          const valueText = marking ? (draft[c.id]?.value ?? c.value_text) : c.value_text;
          const clickable = marking && !readOnly && !save.isPending;
          const toggle = () => toggleDraft(c, !done);
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
              className={`rounded-md border p-4 outline-none transition-colors ${
                done ? "border-success/25 bg-success-soft" : "border-border bg-card"
              } ${
                clickable
                  ? "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                  : ""
              }`}
            >
              <div className="flex items-start gap-4">
                {marking && !readOnly ? (
                  <div className="pt-0.5" aria-hidden>
                    <Checkbox className="pointer-events-none size-4" checked={done} tabIndex={-1} />
                  </div>
                ) : done ? (
                  <div className="pt-0.5 text-success" aria-hidden>
                    <Check className="size-4" />
                  </div>
                ) : (
                  <div className="size-4 shrink-0 pt-0.5" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {c.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {!c.is_required && <span className="rounded bg-muted px-2 py-0.5">необязательное</span>}
                    {KIND_HINT[c.kind] && !done && (
                      <span className="rounded bg-muted px-2 py-0.5">{KIND_HINT[c.kind]}</span>
                    )}
                    {c.to_id_folder && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-info ring-1 ring-inset ring-info/30">
                        <FolderInput className="size-3.5" /> в папку ИД
                      </span>
                    )}
                  </div>
                  {c.kind === "field" && valueText && (
                    <div className="mt-2 text-sm">
                      Значение: <span className="font-semibold">{valueText}</span>
                    </div>
                  )}
                  {c.kind === "file" && (
                    <div
                      className="mt-3 space-y-2"
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
    </div>
  );
});
