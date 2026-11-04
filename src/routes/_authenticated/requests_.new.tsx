import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старый URL формы — редирект на список (создание теперь в диалоге). */
export const Route = createFileRoute("/_authenticated/requests_/new")({
  validateSearch: (s: Record<string, unknown>): { object?: string; type?: string } => ({
    ...(typeof s["object"] === "string" ? { object: s["object"] } : {}),
    ...(typeof s["type"] === "string" ? { type: s["type"] } : {}),
  }),
  beforeLoad: () => {
    throw redirect({ to: "/requests" });
  },
});
