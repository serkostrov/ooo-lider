import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag, ListChecks, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { useProfile, type CurrentProfile } from "@/lib/profile";
import { useRefreshStages, useStage, type ObjectStage } from "@/components/stages/data";
import { StageMainTab, type StageMainHandle } from "@/components/stages/page/StageMainTab";
import {
  StageConditionsTab,
  useStageConditions,
  type StageConditionsHandle,
} from "@/components/stages/page/StageConditionsTab";
import { StageDocumentsTab } from "@/components/stages/page/StageDocumentsTab";
import { StageStepsTab, useStageSteps } from "@/components/stages/page/StageStepsTab";
import { StageStatusBar } from "@/components/stages/page/StageStatusBar";

export const Route = createFileRoute("/_authenticated/objects_/$id_/stages/$stageId")({
  component: StagePage,
  head: () => ({ meta: [{ title: "Этап — Лидер" }] }),
});

function StagePage() {
  const { id, stageId } = Route.useParams();
  const me = useProfile();
  const qc = useQueryClient();
  const refreshStages = useRefreshStages();
  const { data: stage, isLoading } = useStage(stageId);
  const { data: conditions = [] } = useStageConditions(stageId);
  const { data: steps = [] } = useStageSteps(stageId);
  const [tab, setTab] = useState("main");
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conditionsDirty, setConditionsDirty] = useState(false);
  const mainRef = useRef<StageMainHandle>(null);
  const conditionsRef = useRef<StageConditionsHandle>(null);

  useEffect(() => {
    setEditing(false);
    setMarking(false);
    setConditionsDirty(false);
  }, [stageId]);

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

  const access = stageAccess(me, stage);
  const workReadOnly = !access.work;
  const canMarkConditions =
    access.work && !stage.is_excluded && !stage.is_closed && conditions.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
        {back}

        <Tabs
          key={stageId}
          value={tab}
          onValueChange={(next) => {
            if (editing && next !== "main") {
              mainRef.current?.reset();
              setEditing(false);
            }
            if (marking && next !== "conditions") {
              conditionsRef.current?.reset();
              setMarking(false);
              setConditionsDirty(false);
            }
            setTab(next);
          }}
        >
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
              editing={editing}
              canAssign={access.assign}
              canWork={access.work}
              onSaved={refresh}
            />
          </TabsContent>
          <TabsContent value="conditions" className="mt-0">
            <StageConditionsTab
              ref={conditionsRef}
              stage={stage}
              readOnly={workReadOnly}
              marking={marking}
              onChanged={refresh}
              onDirtyChange={setConditionsDirty}
            />
          </TabsContent>
          <TabsContent value="documents" className="mt-0">
            <StageDocumentsTab stage={stage} readOnly={workReadOnly} />
          </TabsContent>
          {steps.length > 0 && (
            <TabsContent value="steps" className="mt-0">
              <StageStepsTab
                steps={steps}
                canAct={(role) => access.canCompleteStep(role)}
                onChanged={refresh}
              />
            </TabsContent>
          )}
          <TabsContent value="history" className="mt-0">
            <HistoryFeed filter={{ entityType: "stage", entityId: stage.id }} />
          </TabsContent>
        </Tabs>
      </div>

      {access.any && tab === "main" && (
        <div className="shrink-0 border-t border-border bg-background py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!editing ? (
              <Button className="h-10 gap-1.5 px-6 text-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
                Редактировать
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-10 px-6 text-sm"
                  disabled={saving}
                  onClick={() => {
                    mainRef.current?.reset();
                    setEditing(false);
                  }}
                >
                  Отмена
                </Button>
                {(access.work || access.assign) && (
                  <Button
                    className="h-10 px-6 text-sm"
                    disabled={saving}
                    onClick={() => {
                      void (async () => {
                        setSaving(true);
                        try {
                          await mainRef.current?.save();
                          setEditing(false);
                        } catch {
                          // ошибка уже показана в форме
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}
                  >
                    {saving ? "Сохранение…" : "Сохранить"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {canMarkConditions && tab === "conditions" && (
        <div className="shrink-0 border-t border-border bg-background py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!marking ? (
              <Button className="h-10 gap-1.5 px-6 text-sm" onClick={() => setMarking(true)}>
                <ListChecks className="size-3.5" />
                Отметить условия
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-10 px-6 text-sm"
                  disabled={saving}
                  onClick={() => {
                    conditionsRef.current?.reset();
                    setMarking(false);
                    setConditionsDirty(false);
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="h-10 px-6 text-sm"
                  disabled={saving || !conditionsDirty}
                  onClick={() => {
                    void (async () => {
                      setSaving(true);
                      try {
                        await conditionsRef.current?.save();
                        setMarking(false);
                        setConditionsDirty(false);
                      } catch {
                        // ошибка уже показана в форме
                      } finally {
                        setSaving(false);
                      }
                    })();
                  }}
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Кто что может менять на карточке этапа. Закрытый и исключённый — только просмотр. */
function stageAccess(me: CurrentProfile, stage: ObjectStage) {
  const locked = stage.is_closed || stage.is_excluded;
  const work =
    !locked && (me.is_admin || me.id === stage.executor_id || me.id === stage.coexecutor_id);
  const assign = !locked && me.is_admin;
  const canCompleteStep = (role: string) => !locked && (me.is_admin || me.role_code === role);
  const any =
    work || assign || (!locked && !!stage.current_step_role && canCompleteStep(stage.current_step_role));
  return { assign, work, any, canCompleteStep };
}
