import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { RequestTypeForm } from "@/components/directories/request-types/RequestTypeForm";
import { RequestTypeFields } from "@/components/directories/request-types/RequestTypeFields";
import { RequestTypeScenario } from "@/components/directories/request-types/RequestTypeScenario";

export const Route = createFileRoute("/_authenticated/directories_/request-types/$id")({
  component: RequestTypeCardPage,
  head: () => ({ meta: [{ title: "Вид заявки — Лидер" }] }),
});


function RequestTypeCardPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const { data: types = [], isLoading } = useRequestTypes();
  const isNew = id === "new";
  const type = isNew ? null : types.find((t) => t.id === id) ?? null;
  const readOnly = !is_admin;

  const back = (
    <Link
      to="/directories"
      search={{ tab: "request-types" }}
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К справочнику
    </Link>
  );

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if ((!isNew && !type) || (isNew && readOnly)) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">
          {isNew ? "Добавлять виды заявок может только администратор" : "Вид заявки не найден или удалён"}
        </p>
      </div>
    );
  }

  return (
    <div>
      {back}
      <h1 className="mb-4 text-xl font-bold">{type ? type.name : "Новый вид заявки"}</h1>
      <Tabs key={id} defaultValue={isNew ? "main" : "fields"}>
        <TabsList className={tabsListClass}>
          <TabsTrigger value="fields" className={tabTriggerClass} disabled={isNew}>Поля заявки</TabsTrigger>
          <TabsTrigger value="scenario" className={tabTriggerClass} disabled={isNew}>Сценарий</TabsTrigger>
          <TabsTrigger value="main" className={tabTriggerClass}>Основное</TabsTrigger>
        </TabsList>
        {isNew && (
          <p className="mb-4 text-sm text-muted-foreground">
            Сначала сохраните вид заявки — после этого можно будет добавить поля.
          </p>
        )}
        <TabsContent value="main">
          <RequestTypeForm
            key={type?.id ?? "new"}
            type={type}
            allTypes={types}
            readOnly={readOnly}
            onCreated={(newId) =>
              navigate({ to: "/directories/request-types/$id", params: { id: newId }, replace: true })
            }
          />
        </TabsContent>
        {type && (
          <>
            <TabsContent value="fields">
              <RequestTypeFields typeId={type.id} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="scenario">
              <RequestTypeScenario typeId={type.id} readOnly={readOnly} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
