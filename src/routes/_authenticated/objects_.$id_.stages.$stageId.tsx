import { useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { useRefreshStages, useStage } from "@/components/stages/data";
import { StageMainTab, type StageMainHandle } from "@/components/stages/page/StageMainTab";
import { StageConditionsTab, useStageConditions } from "@/components/stages/page/StageConditionsTab";
import { StageDocumentsTab } from "@/components/stages/page/StageDocumentsTab";
import { StageStepsTab, useStageSteps } from "@/components/stages/page/StageStepsTab";
import { StageStatusBar } from "@/components/stages/page/StageStatusBar";

export const Route = createFileRoute("/_authenticated/objects_/$id_/stages/$stageId")({
  component: StagePage,
  head: () => ({ meta: [{ title: "Этап — Лидер" }] }),
});

function StagePage() {
  const { id, stageId } = Route.useParams();
  const qc = useQueryClient();
  const refreshStages = useRefreshStages();
  const { data: stage, isLoading } = useStage(stageId);
  const { data: conditions = [] } = useStageConditions(stageId);
  const { data: steps = [] } = useStageSteps(stageId);
  const [tab, setTab] = useState("main");
  const [saving, setSaving] = useState(false);
  const mainRef = useRef<StageMainHandle>(null);

  const refresh = () => {
    refreshStages(id, stageId);
    qc.invalidateQueries({ queryKey: ["stage-predecessors", stageId] });
  };

  const back = (
    <Link
      to="/objects/$id"
      params={{ id }}
      search={{ tab: "stages" }}
      className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> К объекту
    </Link>
  );

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!stage || stage.object_id !== id) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">Этап не найден или у вас нет к нему доступа</p>
      </div>
    );
  }

  const meta: { key: string; node: ReactNode }[] = [];
  if (stage.work_type_name) meta.push({ key: "group", node: stage.work_type_name });
  if (stage.is_critical) {
    meta.push({
      key: "critical",
      node: (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <Flag className="size-3.5 fill-destructive" /> критичный
        </span>
      ),
    });
  }
  if (stage.out_of_order) {
    meta.push({
      key: "ooo",
      node: (
        <span className="inline-flex items-center gap-1 text-warning">
          <AlertTriangle className="size-3.5" /> вне очереди
        </span>
      ),
    });
  }
  if (stage.current_step_action) {
    meta.push({ key: "step", node: <>Сейчас: {stage.current_step_action}</> });
  }

  const showSave = tab === "main" && !stage.is_closed && !stage.is_excluded;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
        {back}

        <Tabs key={stageId} value={tab} onValueChange={setTab}>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <header>
                <h1 className="text-xl font-semibold leading-snug tracking-tight">
                  <span className="text-muted-foreground">{stage.number}.</span> {stage.name}
                </h1>
                {meta.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    {meta.map((m, i) => (
                      <span key={m.key} className="inline-flex items-center gap-2">
                        {i > 0 && <span className="text-border" aria-hidden>·</span>}
                        {m.node}
                      </span>
                    ))}
                  </p>
                )}
              </header>
              <TabsList className={cn(tabsListClass, "mb-0 w-fit self-start")}>
                <TabsTrigger value="main" className={tabTriggerClass}>
                  Карточка
                </TabsTrigger>
                <TabsTrigger value="conditions" className={tabTriggerClass}>
                  Условия
                  {stage.conditions_total > 0 && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                      {stage.conditions_done}/{stage.conditions_total}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="documents" className={tabTriggerClass}>
                  Файлы
                </TabsTrigger>
                {steps.length > 0 && (
                  <TabsTrigger value="steps" className={tabTriggerClass}>
                    Сценарий
                  </TabsTrigger>
                )}
                <TabsTrigger value="history" className={tabTriggerClass}>
                  История
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="w-full shrink-0 lg:w-64">
              <StageStatusBar stage={stage} conditions={conditions} onChanged={refresh} />
            </div>
          </div>

          <TabsContent value="main" className="mt-0">
            <StageMainTab
              ref={mainRef}
              key={stage.id + stage.updated_at}
              stage={stage}
              onSaved={refresh}
            />
          </TabsContent>
          <TabsContent value="conditions" className="mt-0">
            <StageConditionsTab stage={stage} onChanged={refresh} />
          </TabsContent>
          <TabsContent value="documents" className="mt-0">
            <StageDocumentsTab stage={stage} />
          </TabsContent>
          {steps.length > 0 && (
            <TabsContent value="steps" className="mt-0">
              <StageStepsTab steps={steps} disabled={stage.is_excluded || stage.is_closed} onChanged={refresh} />
            </TabsContent>
          )}
          <TabsContent value="history" className="mt-0">
            <HistoryFeed filter={{ entityType: "stage", entityId: stage.id }} />
          </TabsContent>
        </Tabs>
      </div>

      {showSave && (
        <div className="shrink-0 border-t border-border bg-background py-3">
          <Button
            className="h-10 px-6 text-sm"
            disabled={saving}
            onClick={() => {
              void (async () => {
                setSaving(true);
                try {
                  await mainRef.current?.save();
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      )}
    </div>
  );
}
