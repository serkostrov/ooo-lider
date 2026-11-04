import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Flag, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STAGES_KEY, useStageTemplatesFull } from "@/components/directories/stages/data";
import { StageMainForm } from "@/components/directories/stages/StageMainForm";
import { StageConditions } from "@/components/directories/stages/StageConditions";
import { StagePredecessors } from "@/components/directories/stages/StagePredecessors";
import { StageSteps } from "@/components/directories/stages/StageSteps";

export const Route = createFileRoute("/_authenticated/directories_/stages/$id")({
  component: StageCardPage,
  head: () => ({ meta: [{ title: "Этап — Лидер" }] }),
});

function StageCardPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const { data: stages = [], isLoading } = useStageTemplatesFull();
  const isNew = id === "new";
  const stage = isNew ? null : stages.find((s) => s.id === id) ?? null;
  const readOnly = !is_admin;

  const back = (
    <Link
      to="/directories"
      search={{ tab: "stages" }}
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К справочнику
    </Link>
  );

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!isNew && !stage) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">Этап не найден или удалён</p>
      </div>
    );
  }
  if (isNew && readOnly) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">Добавлять этапы может только администратор</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {back}

      <header className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight">
          {isNew ? (
            "Новый этап"
          ) : (
            <span className="inline-flex items-center gap-2.5">
              {stage!.is_critical && (
                <Flag className="size-4 shrink-0 fill-destructive text-destructive" aria-label="Критичный" />
              )}
              <span className="min-w-0">
                <span className="text-muted-foreground">{stage!.number}.</span> {stage!.name}
              </span>
            </span>
          )}
        </h1>
        {stage && !readOnly && <DeleteStage id={stage.id} name={`${stage.number}. ${stage.name}`} />}
      </header>

      <Tabs key={id} defaultValue="main" className="space-y-5">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="main" className={tabTriggerClass}>
            Основное
          </TabsTrigger>
          <TabsTrigger value="conditions" className={tabTriggerClass} disabled={isNew}>
            Условия закрытия
          </TabsTrigger>
          <TabsTrigger value="predecessors" className={tabTriggerClass} disabled={isNew}>
            Предшествующие этапы
          </TabsTrigger>
          <TabsTrigger value="steps" className={tabTriggerClass} disabled={isNew}>
            Сценарий
          </TabsTrigger>
        </TabsList>
        {isNew && (
          <p className="text-sm text-muted-foreground">
            Сначала сохраните основные данные — после этого откроются условия, предшествующие этапы и сценарий.
          </p>
        )}
        <TabsContent value="main" className="mt-0">
          <StageMainForm
            key={stage?.id ?? "new"}
            stage={stage}
            allStages={stages}
            readOnly={readOnly}
            onCreated={(newId) => navigate({ to: "/directories/stages/$id", params: { id: newId }, replace: true })}
          />
        </TabsContent>
        {stage && (
          <>
            <TabsContent value="conditions" className="mt-0">
              <StageConditions templateId={stage.id} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="predecessors" className="mt-0">
              <StagePredecessors templateId={stage.id} allStages={stages} readOnly={readOnly} />
            </TabsContent>
            <TabsContent value="steps" className="mt-0">
              <StageSteps templateId={stage.id} readOnly={readOnly} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function DeleteStage({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("stage_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Этап удалён");
      qc.invalidateQueries({ queryKey: STAGES_KEY });
      qc.invalidateQueries({ queryKey: ["dir-stage-templates-short"] });
      navigate({ to: "/directories", search: { tab: "stages" } });
    },
    onError: showError,
  });
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="Удалить этап"
        aria-label="Удалить этап"
        className="size-9 shrink-0 text-danger hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить этап?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              «{name}» исчезнет из справочника. На уже созданных объектах этап останется. Если этап нужно только
              временно не предлагать — лучше снимите галочку «Активен».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-sm">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 bg-destructive text-sm text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              disabled={m.isPending}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
