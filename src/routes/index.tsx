import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/objects" });
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
