import { supabase } from "@/integrations/supabase/client";

export type AccessAction = "issue_access" | "reset_password" | "request_reset";

export type AccessResult = {
  ok: boolean;
  action?: AccessAction;
  email?: string;
  password?: string;
  emailed?: boolean;
  emailError?: string | null;
  message?: string;
  error?: string;
};

async function invoke(body: Record<string, unknown>): Promise<AccessResult> {
  const { data, error } = await supabase.functions.invoke("admin-user-access", { body });
  if (error) {
    // functions.invoke кладёт тело ошибки отдельно — пробуем вытащить
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const j = (await ctx.json()) as AccessResult & { message?: string };
        if (j?.error) return j;
        const msg = (j?.message ?? "").toLowerCase();
        if (msg.includes("name resolution") || ctx.status === 503) {
          return {
            ok: false,
            error:
              "Сервис сброса пароля не запущен. Локально: supabase functions serve",
          };
        }
      } catch {
        /* ignore */
      }
    }
    const raw = error.message ?? String(error);
    if (raw.includes("non-2xx") || raw.includes("Failed to send")) {
      return {
        ok: false,
        error:
          "Сервис сброса пароля недоступен. Локально проверьте: supabase functions serve",
      };
    }
    throw error;
  }
  const result = (data ?? {}) as AccessResult;
  if (result.error) return result;
  return result;
}

export function issueAccess(profileId: string) {
  return invoke({ action: "issue_access", profile_id: profileId });
}

export function resetPassword(profileId: string) {
  return invoke({ action: "reset_password", profile_id: profileId });
}

export function requestPasswordReset(email: string) {
  return invoke({ action: "request_reset", email });
}
