import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const STAGES_KEY = ["dir-stage-templates"] as const;

export type StageTemplate = {
  id: string;
  number: number;
  name: string;
  work_type_id: string | null;
  description: string | null;
  duration_days: number | null;
  executor_role: string | null;
  confirmer_role: string | null;
  outgoing_doc: string | null;
  expected_doc: string | null;
  response_days: number | null;
  remind_days: number | null;
  is_critical: boolean;
  is_active: boolean;
  sort: number;
};

export const STAGE_FIELDS =
  "id, number, name, work_type_id, description, duration_days, executor_role, confirmer_role, outgoing_doc, expected_doc, response_days, remind_days, is_critical, is_active, sort";

/** Все этапы справочника (без удалённых), по номеру. */
export function useStageTemplatesFull() {
  return useQuery({
    queryKey: STAGES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_templates")
        .select(STAGE_FIELDS)
        .is("deleted_at", null)
        .order("number");
      if (error) throw error;
      return (data ?? []) as StageTemplate[];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ["dir-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("code, name").order("sort");
      if (error) throw error;
      return (data ?? []) as { code: string; name: string }[];
    },
  });
}

export function useWorkTypes() {
  return useQuery({
    queryKey: ["dir-work-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_types")
        .select("id, name, sort")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sort: number }[];
    },
  });
}

export function useDocumentsShort() {
  return useQuery({
    queryKey: ["dir-documents-short"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, section")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; section: string }[];
    },
  });
}

export { ACTION_KINDS, CONDITION_KINDS, toIntOrNull } from "../rules";
