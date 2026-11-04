import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ToneBadge } from "@/components/ToneBadge";
import { supabase } from "@/integrations/supabase/client";
import { OBJECTS_KEY } from "@/components/objects/data";

export type ObjectStage = {
  id: string;
  object_id: string;
  template_id: string | null;
  number: number;
  name: string;
  work_type_id: string | null;
  work_type_name: string | null;
  description: string | null;
  duration_days: number | null;
  executor_id: string | null;
  executor_name: string | null;
  coexecutor_id: string | null;
  coexecutor_name: string | null;
  confirmer_role: string | null;
  confirmer_role_name: string | null;
  confirmer_id: string | null;
  confirmer_name: string | null;
  status_code: string;
  status_name: string;
  status_color: string;
  is_closed: boolean;
  start_date: string | null;
  due_date: string | null;
  outgoing_doc: string | null;
  expected_doc: string | null;
  doc_sent_at: string | null;
  response_days: number | null;
  response_due: string | null;
  response_received_at: string | null;
  remind_days: number | null;
  note: string | null;
  is_critical: boolean;
  is_excluded: boolean;
  out_of_order: boolean;
  return_reason: string | null;
  closed_at: string | null;
  sort: number;
  updated_at: string;
  conditions_total: number;
  conditions_done: number;
  is_overdue: boolean;
  is_due_soon: boolean;
  is_no_response: boolean;
  is_no_executor: boolean;
  days_left: number | null;
  current_step_role: string | null;
  current_step_action: string | null;
};

export type StageCondition = {
  id: string;
  stage_id: string;
  title: string;
  kind: "check" | "file" | "field";
  is_required: boolean;
  to_id_folder: boolean;
  is_done: boolean;
  value_text: string | null;
  sort: number;
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const normalize = (r: Record<string, unknown>) =>
  ({
    ...(r as unknown as ObjectStage),
    conditions_total: n(r["conditions_total"]),
    conditions_done: n(r["conditions_done"]),
    is_overdue: !!r["is_overdue"],
    is_due_soon: !!r["is_due_soon"],
    is_no_response: !!r["is_no_response"],
    is_no_executor: !!r["is_no_executor"],
    is_closed: !!r["is_closed"],
  }) as ObjectStage;

export const stagesKey = (objectId: string) => ["object-stages", objectId];
export const stageKey = (stageId: string) => ["stage", stageId];
export const conditionsKey = (objectId: string) => ["object-stage-conditions", objectId];

export function useObjectStages(objectId: string) {
  return useQuery({
    queryKey: stagesKey(objectId),
    enabled: !!objectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_object_stages")
        .select("*")
        .eq("object_id", objectId)
        .order("sort")
        .order("number");
      if (error) throw error;
      return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
    },
  });
}

export function useStage(stageId: string) {
  return useQuery({
    queryKey: stageKey(stageId),
    queryFn: async () => {
      const { data, error } = await supabase.from("v_object_stages").select("*").eq("id", stageId).maybeSingle();
      if (error) throw error;
      return data ? normalize(data as Record<string, unknown>) : null;
    },
  });
}

/** Условия закрытия всех этапов объекта. */
export function useObjectConditions(objectId: string, stageIds: string[]) {
  return useQuery({
    queryKey: conditionsKey(objectId),
    enabled: stageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_conditions")
        .select("id, stage_id, title, kind, is_required, to_id_folder, is_done, value_text, sort")
        .in("stage_id", stageIds)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as StageCondition[];
    },
  });
}

/** Связи «предшествующие этапы» в пределах объекта: stage_id → [predecessor_id]. */
export function useObjectPredecessors(objectId: string, stageIds: string[]) {
  return useQuery({
    queryKey: ["object-stage-predecessors", objectId],
    enabled: stageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_predecessors")
        .select("stage_id, predecessor_id")
        .in("stage_id", stageIds);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of data ?? []) (map[r.stage_id] ??= []).push(r.predecessor_id);
      return map;
    },
  });
}

/** Сбросить всё, что зависит от этапов объекта (таблица, этап, сводки, история). */
export function useRefreshStages() {
  const qc = useQueryClient();
  return (objectId: string, stageId?: string) => {
    qc.invalidateQueries({ queryKey: stagesKey(objectId) });
    qc.invalidateQueries({ queryKey: conditionsKey(objectId) });
    qc.invalidateQueries({ queryKey: ["overdue"] });
    qc.invalidateQueries({ queryKey: OBJECTS_KEY });
    qc.invalidateQueries({ queryKey: ["history"] });
    if (stageId) {
      qc.invalidateQueries({ queryKey: stageKey(stageId) });
      qc.invalidateQueries({ queryKey: ["stage-conditions", stageId] });
      qc.invalidateQueries({ queryKey: ["stage-steps", stageId] });
    }
  };
}

export function StatusBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <ToneBadge color={color} className={className} truncate={false}>
      {name}
    </ToneBadge>
  );
}
