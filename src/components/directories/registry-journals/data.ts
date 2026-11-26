import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RegistryFieldType = "text" | "number" | "date" | "select" | "textarea";

export type RegistrySystemKey =
  | "counterparty"
  | "out_date"
  | "out_content"
  | "in_date"
  | "in_letter_no"
  | "in_content";

export type RegistryJournal = {
  id: string;
  code: string;
  name: string;
  sort: number;
  is_active: boolean;
};

export type RegistryJournalField = {
  id: string;
  journal_id: string;
  label: string;
  field_type: RegistryFieldType;
  system_key: RegistrySystemKey | null;
  options: string[];
  is_required: boolean;
  show_in_table: boolean;
  show_on_accept: boolean;
  sort: number;
};

export const REGISTRY_JOURNALS_KEY = ["registry-journals"] as const;

export function useRegistryJournals(activeOnly = false) {
  return useQuery({
    queryKey: [...REGISTRY_JOURNALS_KEY, activeOnly ? "active" : "all"],
    queryFn: async (): Promise<RegistryJournal[]> => {
      let q = supabase
        .from("registry_journals" as never)
        .select("id, code, name, sort, is_active")
        .is("deleted_at", null)
        .order("sort");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RegistryJournal[];
    },
  });
}

export function useRegistryJournalFields(journalId: string | null | undefined) {
  return useQuery({
    queryKey: [...REGISTRY_JOURNALS_KEY, "fields", journalId],
    enabled: !!journalId,
    queryFn: async (): Promise<RegistryJournalField[]> => {
      const { data, error } = await supabase
        .from("registry_journal_fields" as never)
        .select(
          "id, journal_id, label, field_type, system_key, options, is_required, show_in_table, show_on_accept, sort",
        )
        .eq("journal_id", journalId!)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return ((data ?? []) as Array<RegistryJournalField & { options: unknown }>).map((f) => ({
        ...f,
        options: Array.isArray(f.options) ? f.options.map(String) : [],
      }));
    },
  });
}

export function useRegistryJournalRequestTypeIds(journalId: string | null | undefined) {
  return useQuery({
    queryKey: [...REGISTRY_JOURNALS_KEY, "rt", journalId],
    enabled: !!journalId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("registry_journal_request_types" as never)
        .select("request_type_id")
        .eq("journal_id", journalId!);
      if (error) throw error;
      return ((data ?? []) as { request_type_id: string }[]).map((r) => r.request_type_id);
    },
  });
}

export function useSaveRegistryJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      code: string;
      name: string;
      sort: number;
      is_active: boolean;
      request_type_ids: string[];
    }) => {
      const { data, error } = await supabase.rpc("registry_save_journal" as never, {
        p_id: input.id ?? null,
        p_code: input.code,
        p_name: input.name,
        p_sort: input.sort,
        p_is_active: input.is_active,
        p_request_type_ids: input.request_type_ids,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REGISTRY_JOURNALS_KEY });
    },
  });
}

export function useSaveRegistryJournalField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      journal_id: string;
      label: string;
      field_type: RegistryFieldType;
      system_key?: string | null;
      options?: string[];
      is_required: boolean;
      show_in_table: boolean;
      show_on_accept: boolean;
      sort: number;
    }) => {
      const { data, error } = await supabase.rpc("registry_save_journal_field" as never, {
        p_id: input.id ?? null,
        p_journal_id: input.journal_id,
        p_label: input.label,
        p_field_type: input.field_type,
        p_system_key: input.system_key ?? null,
        p_options: input.options ?? [],
        p_is_required: input.is_required,
        p_show_in_table: input.show_in_table,
        p_show_on_accept: input.show_on_accept,
        p_sort: input.sort,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      void qc.invalidateQueries({
        queryKey: [...REGISTRY_JOURNALS_KEY, "fields", vars.journal_id],
      });
    },
  });
}

export function useDeleteRegistryJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("registry_soft_delete_journal" as never, {
        p_id: id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: REGISTRY_JOURNALS_KEY });
    },
  });
}

export function useDeleteRegistryJournalField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, journalId }: { id: string; journalId: string }) => {
      const { error } = await supabase.rpc("registry_soft_delete_journal_field" as never, {
        p_id: id,
      } as never);
      if (error) throw error;
      return journalId;
    },
    onSuccess: (journalId) => {
      void qc.invalidateQueries({
        queryKey: [...REGISTRY_JOURNALS_KEY, "fields", journalId],
      });
    },
  });
}

export const FIELD_TYPE_LABELS: Record<RegistryFieldType, string> = {
  text: "Текст",
  textarea: "Многострочный",
  number: "Число",
  date: "Дата",
  select: "Список",
};
