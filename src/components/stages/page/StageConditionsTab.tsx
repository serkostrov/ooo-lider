import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderInput } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listFiles } from "@/lib/files";
import { ConditionToggle } from "../ConditionToggle";
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

export function StageConditionsTab({
  stage,
  readOnly = false,
  onChanged,
}: {
  stage: ObjectStage;
  readOnly?: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: conds = [], isLoading } = useStageConditions(stage.id);
  const fileCondIds = conds.filter((c) => c.kind === "file").map((c) => c.id);
  const filesKey = ["stage-condition-files", stage.id];
  const { data: files = [] } = useQuery({
    queryKey: [...filesKey, fileCondIds.join(",")],
    queryFn: () => listFiles("stage_condition", fileCondIds),
    enabled: fileCondIds.length > 0,
  });

  if (isLoading) return null;
  if (conds.length === 0) return <p className="py-4 text-sm text-muted-foreground">У этапа нет условий закрытия</p>;

  const required = conds.filter((c) => c.is_required);
  const doneRequired = required.filter((c) => c.is_done).length;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Обязательных выполнено: <span className="font-semibold">{doneRequired} из {required.length}</span>
        {doneRequired === required.length && required.length > 0 && (
          <span className="ml-2 text-success">— можно отправлять на проверку</span>
        )}
      </p>
      <ul className="space-y-3">
        {conds.map((c) => {
          const condFiles = files.filter((f) => f.entity_id === c.id);
          return (
            <li key={c.id} className={`rounded-md border p-4 ${c.is_done ? "border-success/25 bg-success-soft" : "border-border bg-card"}`}>
              <div className="flex items-start gap-4">
                <div className="pt-0.5">
                  <ConditionToggle cond={c} disabled={stage.is_excluded || readOnly} onDone={onChanged} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${c.is_done ? "text-muted-foreground line-through" : "font-medium"}`}>{c.title}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {!c.is_required && <span className="rounded bg-muted px-2 py-0.5">необязательное</span>}
                    {KIND_HINT[c.kind] && !c.is_done && <span className="rounded bg-muted px-2 py-0.5">{KIND_HINT[c.kind]}</span>}
                    {c.to_id_folder && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-info ring-1 ring-inset ring-info/30">
                        <FolderInput className="size-3.5" /> в папку ИД
                      </span>
                    )}
                  </div>
                  {c.kind === "field" && c.value_text && (
                    <div className="mt-2 text-sm">
                      Значение: <span className="font-semibold">{c.value_text}</span>
                    </div>
                  )}
                  {c.kind === "file" && (
                    <div className="mt-3 space-y-2">
                      <FileList files={condFiles} />
                      {!stage.is_excluded && !readOnly && (
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
    </div>
  );
}
