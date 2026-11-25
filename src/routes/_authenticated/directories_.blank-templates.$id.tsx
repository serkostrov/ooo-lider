import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { BlankTemplateForm } from "@/components/directories/blank-templates/BlankTemplateForm";
import {
  useBlankTemplateUsages,
  useBlankTemplates,
} from "@/components/directories/blank-templates/data";

export const Route = createFileRoute("/_authenticated/directories_/blank-templates/$id")({
  component: BlankTemplateCardPage,
  head: () => ({ meta: [{ title: "Шаблон бланка — Лидер" }] }),
});

function BlankTemplateCardPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const { data: templates = [], isLoading } = useBlankTemplates();
  const { data: usagesMap } = useBlankTemplateUsages();
  const isNew = id === "new";
  const template = isNew ? null : templates.find((t) => t.id === id) ?? null;
  const usages = useMemo(
    () => (template ? (usagesMap?.get(template.id) ?? []) : []),
    [template, usagesMap],
  );

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

  const back = (
    <Link
      to="/directories"
      search={{ tab: "blank-templates" }}
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К шаблонам
    </Link>
  );

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

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!isNew && !template) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">Шаблон не найден или удалён</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
      {back}
      <h1 className="mb-4 text-xl font-bold">
        {template ? template.name : "Новый шаблон бланка"}
      </h1>
      <BlankTemplateForm
        key={template?.id ?? "new"}
        template={template}
        usages={usages}
        readOnly={false}
        onCreated={(newId) =>
          navigate({
            to: "/directories/blank-templates/$id",
            params: { id: newId },
            replace: true,
          })
        }
        onDeleted={() =>
          navigate({ to: "/directories", search: { tab: "blank-templates" } })
        }
      />
    </div>
  );
}
