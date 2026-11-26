import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useRegistryJournalFields,
  useRegistryJournals,
  type RegistryJournal,
  type RegistryJournalField,
  type RegistrySystemKey,
} from "@/components/directories/registry-journals/data";

export type { RegistryJournal, RegistryJournalField, RegistrySystemKey };
export { useRegistryJournals, useRegistryJournalFields };

export type RegistryEntry = {
  id: string;
  journal_id: string;
  channel: string;
  number: number;
  request_id: string | null;
  request_type_id: string | null;
  object_id: string | null;
  counterparty: string | null;
  out_date: string | null;
  out_content: string | null;
  out_doc_path: string | null;
  in_date: string | null;
  in_letter_no: string | null;
  in_content: string | null;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  object_name?: string | null;
  request_number?: number | null;
};

export function systemValue(
  entry: Pick<
    RegistryEntry,
    "counterparty" | "out_date" | "out_content" | "in_date" | "in_letter_no" | "in_content" | "extra"
  >,
  field: RegistryJournalField,
): string {
  if (field.system_key) {
    const v = entry[field.system_key];
    return v == null ? "" : String(v);
  }
  const raw = entry.extra?.[field.id];
  if (raw == null) return "";
  return String(raw);
}

export function useRegistryEntries(journalId: string | null | undefined) {
  return useQuery({
    queryKey: ["registry-entries", journalId],
    enabled: !!journalId,
    queryFn: async (): Promise<RegistryEntry[]> => {
      const { data, error } = await supabase
        .from("registry_entries" as never)
        .select(
          "id, journal_id, channel, number, request_id, request_type_id, object_id, counterparty, out_date, out_content, out_doc_path, in_date, in_letter_no, in_content, extra, created_at, updated_at, objects(name), requests(number)",
        )
        .eq("journal_id", journalId!)
        .is("deleted_at", null)
        .order("number", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<
        RegistryEntry & {
          objects?: { name: string } | null;
          requests?: { number: number } | null;
          extra?: Record<string, unknown> | null;
        }
      >).map((row) => ({
        id: row.id,
        journal_id: row.journal_id,
        channel: row.channel,
        number: row.number,
        request_id: row.request_id,
        request_type_id: row.request_type_id,
        object_id: row.object_id,
        counterparty: row.counterparty,
        out_date: row.out_date,
        out_content: row.out_content,
        out_doc_path: row.out_doc_path,
        in_date: row.in_date,
        in_letter_no: row.in_letter_no,
        in_content: row.in_content,
        extra: row.extra && typeof row.extra === "object" ? row.extra : {},
        created_at: row.created_at,
        updated_at: row.updated_at,
        object_name: row.objects?.name ?? null,
        request_number: row.requests?.number ?? null,
      }));
    },
  });
}

export type RegistrySaveInput = {
  id?: string | null;
  journal_id: string;
  counterparty: string;
  out_date: string | null;
  out_content: string;
  in_date: string | null;
  in_letter_no: string;
  in_content: string;
  object_id?: string | null;
  extra?: Record<string, unknown>;
};

export function useRegistrySave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrySaveInput) => {
      const { data, error } = await supabase.rpc("registry_save_entry" as never, {
        p_id: input.id ?? null,
        p_journal_id: input.journal_id,
        p_counterparty: input.counterparty,
        p_out_date: input.out_date || null,
        p_out_content: input.out_content,
        p_in_date: input.in_date || null,
        p_in_letter_no: input.in_letter_no,
        p_in_content: input.in_content,
        p_object_id: input.object_id ?? null,
        p_extra: input.extra ?? {},
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, vars) => {
      void qc.invalidateQueries({ queryKey: ["registry-entries", vars.journal_id] });
    },
  });
}

export function useRegistryDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, journalId }: { id: string; journalId: string }) => {
      const { error } = await supabase.rpc("registry_soft_delete" as never, {
        p_id: id,
      } as never);
      if (error) throw error;
      return journalId;
    },
    onSuccess: (journalId) => {
      void qc.invalidateQueries({ queryKey: ["registry-entries", journalId] });
    },
  });
}

export async function registryAcceptWithResponse(args: {
  requestId: string;
  letterNo: string;
  content: string;
  date?: string | null;
  extra?: Record<string, unknown>;
}) {
  const { error } = await supabase.rpc("registry_accept_with_response" as never, {
    p_request_id: args.requestId,
    p_letter_no: args.letterNo,
    p_content: args.content,
    p_date: args.date || null,
    p_extra: args.extra ?? {},
  } as never);
  if (error) throw error;
}

export async function registryJournalIdForRequest(requestId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("registry_journal_id_for_request" as never, {
    p_request_id: requestId,
  } as never);
  if (error) throw error;
  return (data as string | null) ?? null;
}
