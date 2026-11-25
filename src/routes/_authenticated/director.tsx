import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useProfile } from "@/lib/profile";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { useDirectorDashboard } from "@/components/director/data";
import { DirectorKpiCards } from "@/components/director/DirectorKpi";
import { DirectorCharts } from "@/components/director/DirectorCharts";
import { DirectorLists } from "@/components/director/DirectorLists";
import { DirectorObjectFocus } from "@/components/director/DirectorObjectFocus";

export const Route = createFileRoute("/_authenticated/director")({
  component: DirectorPage,
  validateSearch: (search: Record<string, unknown>): { object?: string } => {
    const raw = search["object"];
    if (typeof raw === "string" && raw) return { object: raw };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Панель управления — Лидер" },
      { name: "description", content: "Сводка по объектам для руководителя" },
    ],
  }),
});

function DirectorPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const { object: selectedObjectId } = Route.useSearch();
  const { data, isLoading, isError, error } = useDirectorDashboard();

  useEffect(() => {
    if (!is_admin) {
      void navigate({ to: "/objects" });
    }
  }, [is_admin, navigate]);

  if (!is_admin) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Раздел доступен только администратору и руководителю.{" "}
        <Link to="/objects" className="text-primary hover:underline">
          К объектам
        </Link>
      </div>
    );
  }

  return (
    <PageFrame
      header={
        <PageHeader
          title="Панель управления"
          description="Готовность, нагрузка, риски и ближайшие сроки по объектам в работе"
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-4 pr-0.5">
        {isError ? (
          <p className="text-sm text-danger">
            Не удалось загрузить сводку: {error instanceof Error ? error.message : "ошибка"}
          </p>
        ) : null}
        <DirectorKpiCards kpi={data?.kpi} problems={data?.problems} loading={isLoading} />
        <DirectorObjectFocus
          objects={data?.objectProgress}
          problems={data?.problems}
          loading={isLoading}
          selectedObjectId={selectedObjectId ?? null}
        />
        <DirectorCharts
          workTypeReadiness={data?.workTypeReadiness}
          executorLoad={data?.executorLoad}
          objectProgress={data?.objectProgress}
          attentionMix={data?.attentionMix}
          loading={isLoading}
          onSelectObject={(id) => {
            void navigate({
              to: "/director",
              search: (prev) => ({ ...prev, object: id }),
            });
            requestAnimationFrame(() => {
              document.getElementById("director-object-focus")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }}
        />
        <DirectorLists overdue={data?.overdue} dueSoon={data?.dueSoon} loading={isLoading} />
      </div>
    </PageFrame>
  );
}
