import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FIELD_TYPES as FIELD_TYPES_SRC, FILLED_BY as FILLED_BY_SRC } from "../rules";

export const REQUEST_TYPES_KEY = ["dir-request-types"] as const;

export type RequestType = {
  id: string;
  name: string;
  sort: number;
  is_active: boolean;
  uses_representatives: boolean;
  send_to_email: string | null;
};

export type FieldType = (typeof FIELD_TYPES_SRC)[number]["v"];

export type RequestField = {
  id: string;
  request_type_id: string;
  label: string;
  field_type: FieldType;
  options: string[];
  is_required: boolean;
  filled_by: "initiator" | "office";
  sort: number;
  is_active: boolean;
};

export const FIELD_TYPES: { v: FieldType; label: string }[] = [...FIELD_TYPES_SRC];
export const FILLED_BY: { v: RequestField["filled_by"]; label: string }[] = [...FILLED_BY_SRC];

export function useRequestTypes() {
  return useQuery({
    queryKey: REQUEST_TYPES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_types")
        .select("id, name, sort, is_active, uses_representatives, send_to_email")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as RequestType[];
    },
  });
}

/** Поля всех видов (без удалённых) — для счётчиков и карточки. */
export function useRequestFields(typeId?: string) {
  return useQuery({
    queryKey: ["dir-request-fields", typeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("request_type_fields")
        .select("id, request_type_id, label, field_type, options, is_required, filled_by, sort, is_active")
        .is("deleted_at", null)
        .order("sort");
      if (typeId) q = q.eq("request_type_id", typeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((f) => ({
        ...f,
        options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : [],
      })) as RequestField[];
    },
  });
}

export type RequestScenarioStep = {
  id: string;
  step_no: number;
  role_code: string;
  to_status: string;
  field_ids: string[];
};

const STATUS_FLOW = ["new", "ready", "sent", "accepted", "done"] as const;

/** Следующий статус по фиксированному порядку хода заявки. Из rework — снова ready. */
export function nextRequestStatus(status: string): string | null {
  if (status === "rework") return "ready";
  const i = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);
  if (i < 0 || i >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1]!;
}

/** Сценарий вида: роль и обязательные поля на каждый переход. */
export function useRequestTypeScenario(typeId?: string) {
  return useQuery({
    queryKey: ["request-type-scenario", typeId ?? ""],
    enabled: !!typeId,
    queryFn: async () => {
      const { data: steps, error } = await supabase
        .from("request_type_scenario_steps")
        .select("id, step_no, role_code, to_status")
        .eq("request_type_id", typeId!)
        .is("deleted_at", null)
        .order("step_no");
      if (error) throw error;
      const list = steps ?? [];
      if (list.length === 0) return [] as RequestScenarioStep[];
      const { data: fields, error: fe } = await supabase
        .from("request_type_scenario_step_fields")
        .select("step_id, field_id")
        .in(
          "step_id",
          list.map((s) => s.id),
        );
      if (fe) throw fe;
      const byStep = fields ?? [];
      return list.map((s) => ({
        id: s.id,
        step_no: s.step_no,
        role_code: s.role_code,
        to_status: s.to_status,
        field_ids: byStep.filter((f) => f.step_id === s.id).map((f) => f.field_id),
      })) as RequestScenarioStep[];
    },
  });
}

/**
 * Поля, без которых нельзя перейти на toStatus:
 * отмеченные в сценарии шага + глобально обязательные (как в request_set_status).
 */
export function requiredFieldIdsForTransition(
  steps: RequestScenarioStep[],
  fields: RequestField[],
  toStatus: string,
): Set<string> {
  const ids = new Set<string>();
  const step = [...steps]
    .filter((s) => s.to_status === toStatus)
    .sort((a, b) => a.step_no - b.step_no)[0];
  if (step) for (const id of step.field_ids) ids.add(id);

  if (toStatus === "ready" || toStatus === "sent") {
    for (const f of fields) {
      if (!f.is_active || !f.is_required) continue;
      if (f.filled_by === "initiator") ids.add(f.id);
      if (toStatus === "sent" && f.filled_by === "office") ids.add(f.id);
    }
  }
  return ids;
}

/** Роль сценария для перехода на toStatus; null если шага нет. */
export function scenarioRoleForTransition(
  steps: RequestScenarioStep[],
  toStatus: string,
): string | null {
  const step = [...steps]
    .filter((s) => s.to_status === toStatus)
    .sort((a, b) => a.step_no - b.step_no)[0];
  return step?.role_code ?? null;
}
