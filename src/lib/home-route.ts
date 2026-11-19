import { supabase } from "@/integrations/supabase/client";

/** Стартовая страница после входа / на «/». */
export async function homeRouteForCurrentUser(): Promise<"/director" | "/objects"> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return "/objects";

  const { data } = await supabase
    .from("profiles")
    .select("id, role_code")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (data?.role_code === "director") return "/director";
  if (data?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pr } = await (supabase as any)
      .from("profile_roles")
      .select("role_code")
      .eq("profile_id", data.id)
      .eq("role_code", "director")
      .maybeSingle();
    if (pr) return "/director";
  }
  return "/objects";
}
