import { createFileRoute, redirect } from "@tanstack/react-router";
import { AUTH_BYPASS } from "@/lib/auth-bypass";
import { homeRouteForCurrentUser } from "@/lib/home-route";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (AUTH_BYPASS) throw redirect({ to: "/objects" });
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    throw redirect({ to: await homeRouteForCurrentUser() });
  },
  head: () => ({
    meta: [
      { title: "Лидер" },
      { name: "description", content: "Контроль этапов строительных работ" },
      { property: "og:title", content: "Лидер" },
      { property: "og:description", content: "Контроль этапов строительных работ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
