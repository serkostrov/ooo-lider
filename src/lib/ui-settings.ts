import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";

/** Показывать полноэкранное «Просрочено» после входа этого пользователя. */
export const SHOW_OVERDUE_GATE_KEY = "show_overdue_gate";

function settingsKey(profileId: string) {
  return ["user-settings", profileId, SHOW_OVERDUE_GATE_KEY] as const;
}

function asFlag(value: unknown): boolean {
  return value !== false && value !== "false";
}

export function useShowOverdueGate() {
  const { id } = useProfile();
  return useQuery({
    queryKey: settingsKey(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("value")
        .eq("profile_id", id)
        .eq("key", SHOW_OVERDUE_GATE_KEY)
        .maybeSingle();
      if (error) throw error;
      return data ? asFlag(data.value) : true;
    },
  });
}

export function useSetShowOverdueGate() {
  const { id } = useProfile();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ profile_id: id, key: SHOW_OVERDUE_GATE_KEY, value: on });
      if (error) throw error;
      return on;
    },
    onSuccess: (on) => {
      qc.setQueryData(settingsKey(id), on);
    },
    onError: () => {
      toast.error("Не удалось сохранить настройку");
    },
  });
}
