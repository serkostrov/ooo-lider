import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Flag, ListChecks, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { useProfile, type CurrentProfile } from "@/lib/profile";
import {
  canAssignStage,
  canCompleteStageStep,
  canWorkStage,
} from "@/lib/permissions";
import { useRefreshStages, useStage, type ObjectStage } from "@/components/stages/data";
import { StageMainTab, type StageMainHandle } from "@/components/stages/page/StageMainTab";
import {
  StageConditionsTab,
  useStageConditions,
  type StageConditionsHandle,
} from "@/components/stages/page/StageConditionsTab";
import { StageStepsTab, useStageSteps } from "@/components/stages/page/StageStepsTab";
import { StageMessagesTab, useStageMessages } from "@/components/stages/page/StageMessagesTab";
import { StageStatusBar } from "@/components/stages/page/StageStatusBar";
import { StageMobileDock } from "@/components/stages/page/StageMobileDock";
import { StageSubstages } from "@/components/stages/page/StageSubstages";
import { RequestStatusButton } from "@/components/stages/RequestStatusButton";
import { useObjectIdFolderItems } from "@/components/objects/ObjectIdFolderTab";

const STAGE_TABS = ["main", "conditions", "steps", "messages", "history"] as const;
type StageTab = (typeof STAGE_TABS)[number];

export const Route = createFileRoute("/_authenticated/objects_/$id_/stages/$stageId")({
  validateSearch: (search: Record<string, unknown>): { tab?: StageTab } => {
    const raw = search["tab"];
    // Старый ?tab=documents больше не используется
    if (raw === "documents") return {};
    const tab = STAGE_TABS.find((t) => t === raw);
    return tab ? { tab } : {};
  },
  component: StagePage,
  head: () => ({ meta: [{ title: "Этап — Лидер" }] }),
});

function StagePage() {
  const { id, stageId } = Route.useParams();
  const { tab: tabFromSearch = "main" } = Route.useSearch();
  const navigate = useNavigate({ from: "/objects/$id/stages/$stageId" });
  const me = useProfile();
  const qc = useQueryClient();
  const refreshStages = useRefreshStages();
  const { data: stage, isLoading } = useStage(stageId);
  const { data: conditions = [] } = useStageConditions(stageId);
  const { data: steps = [] } = useStageSteps(stageId);
  const { data: messages = [] } = useStageMessages(stageId);
  const { data: idFolderItems = [] } = useObjectIdFolderItems(id);
  const idFolderMissing = idFolderItems.filter((i) => !i.is_done).length;
  const tab = tabFromSearch === "steps" && steps.length === 0 ? "main" : tabFromSearch;
  const setTab = (next: string) => {
    const t = STAGE_TABS.find((x) => x === next) ?? "main";
    void navigate({
      search: t === "main" ? {} : { tab: t },
      replace: true,
    });
  };
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
  if (stage.requires_id_folder_complete) {
    meta.push({
      key: "id_folder",
      node: (
        <Link
          to="/objects/$id"
          params={{ id }}
          search={{ tab: "id_folder" }}
          className="inline-flex items-center gap-1 font-medium text-warning hover:underline"
        >
          нужна полная папка ИД
          {idFolderMissing > 0 ? ` · −${idFolderMissing}` : ""}
        </Link>
      ),
    });
  }
  if (stage.is_adhoc) {
    meta.push({
      key: "adhoc",
      node: <span className="font-medium text-info">вне регламента</span>,
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
  if (stage.return_reason && (stage.status_code === "in_work" || stage.status_code === "not_started")) {
    meta.push({
      key: "return",
      node: (
        <span className="inline-flex max-w-full items-center gap-1 text-warning" title={stage.return_reason}>
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">возврат: {stage.return_reason}</span>
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
  const canAskStatus =
    !stage.is_closed && !stage.is_excluded && (me.is_admin || access.assign);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-24 lg:pb-6">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <h1 className="min-w-0 text-xl font-semibold leading-snug tracking-tight">
                    <span className="text-muted-foreground">{stage.code || stage.number}.</span> {stage.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    {canAskStatus ? (
                      <RequestStatusButton
                        stageId={stage.id}
                        className="h-9 px-2.5"
                        onAsked={() => setTab("messages")}
                      />
                    ) : null}
                    {access.any && tab === "main" && !editing ? (
                      <Button
                        variant="outline"
                        className="h-9 gap-1.5 px-2.5 text-sm lg:hidden"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="size-3.5" />
                        Изменить
                      </Button>
                    ) : null}
                    {canMarkConditions && tab === "conditions" && !marking ? (
                      <Button
                        variant="outline"
                        className="h-9 gap-1.5 px-2.5 text-sm lg:hidden"
                        onClick={() => setMarking(true)}
                      >
                        <ListChecks className="size-3.5" />
                        Отметить
                      </Button>
                    ) : null}
                  </div>
                </div>
                {stage.parent_id && stage.parent_name && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Подэтап этапа {stage.parent_code}: {stage.parent_name}
                  </p>
                )}
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
              <TabsList className={cn(tabsListClass, "mb-0")}>
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
                {steps.length > 0 && (
                  <TabsTrigger value="steps" className={tabTriggerClass}>
                    Сценарий
                  </TabsTrigger>
                )}
                <TabsTrigger value="messages" className={tabTriggerClass}>
                  Сообщения
                  {messages.length > 0 && (
                    <span
                      aria-hidden
                      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary/15 px-1 text-[10px] font-semibold leading-none tabular-nums text-primary"
                    >
                      {messages.length > 99 ? "99+" : messages.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className={tabTriggerClass}>
                  История
                </TabsTrigger>
              </TabsList>
              {editing && tab === "main" ? (
                <div className="flex gap-2 lg:hidden">
                  <Button
                    variant="outline"
                    className="h-9 flex-1 text-sm"
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
                      className="h-9 flex-1 text-sm"
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
                      {saving ? "…" : "Сохранить"}
                    </Button>
                  )}
                </div>
              ) : null}
              {marking && tab === "conditions" ? (
                <div className="flex gap-2 lg:hidden">
                  <Button
                    variant="outline"
                    className="h-9 flex-1 text-sm"
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
                    className="h-9 flex-1 text-sm"
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
                    {saving ? "…" : "Сохранить"}
                  </Button>
                </div>
              ) : null}
            </div>
            {/* На мобилке действия — в StageMobileDock, здесь не дублируем. */}
            <div className="hidden w-full shrink-0 lg:block lg:w-64">
              <StageStatusBar
                stage={stage}
                conditions={conditions}
                onChanged={refresh}
                idFolderMissing={idFolderMissing}
              />
            </div>
          </div>

          <StageMobileDock
            stage={stage}
            conditions={conditions}
            idFolderMissing={idFolderMissing}
            onChanged={refresh}
            onOpenConditions={() => setTab("conditions")}
          />

          <TabsContent value="main" className="mt-0 space-y-4">
            <StageMainTab
              ref={mainRef}
              key={stage.id + stage.updated_at}
              stage={stage}
              editing={editing}
              canAssign={access.assign}
              canWork={access.work}
              onSaved={refresh}
            />
            {!stage.parent_id && <StageSubstages objectId={id} parent={stage} />}
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
          {steps.length > 0 && (
            <TabsContent value="steps" className="mt-0">
              <StageStepsTab
                steps={steps}
                canAct={(role) => access.canCompleteStep(role)}
                onChanged={refresh}
              />
            </TabsContent>
          )}
          <TabsContent value="messages" className="mt-0">
            <StageMessagesTab stage={stage} />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <HistoryFeed filter={{ entityType: "stage", entityId: stage.id }} />
          </TabsContent>
        </Tabs>
      </div>

      {access.any && tab === "main" && (
        <div className="hidden shrink-0 border-t border-border bg-background py-3 lg:block">
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
        <div className="hidden shrink-0 border-t border-border bg-background py-3 lg:block">
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
  const work = canWorkStage(me, stage);
  const assign = canAssignStage(me, stage);
  const completeStep = (role: string) => canCompleteStageStep(me, stage, role);
  const any =
    work || assign || (!!stage.current_step_role && completeStep(stage.current_step_role));
  return { assign, work, any, canCompleteStep: completeStep };
}
