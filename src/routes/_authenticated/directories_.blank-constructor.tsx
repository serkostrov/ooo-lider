import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старый экспериментальный URL → справочник шаблонов. */
export const Route = createFileRoute("/_authenticated/directories_/blank-constructor")({
  beforeLoad: () => {
    throw redirect({ to: "/directories", search: { tab: "blank-templates" } });
  },
});
