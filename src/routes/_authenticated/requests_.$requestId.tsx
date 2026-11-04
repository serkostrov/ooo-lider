import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { listFiles } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { useRequestFields } from "@/components/directories/request-types/data";
import { useActiveProfiles } from "@/components/objects/data";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { FileList, UploadButton } from "@/components/stages/page/FileButtons";
import { isEmptyValue } from "@/components/requests/FieldInput";
import {
  markRequestSeen,
  useRefreshRequests,
  type FieldValue,
  type RequestRow,
} from "@/components/requests/data";
import {
  RequestFieldsBlock,
  type RequestFieldsHandle,
} from "@/components/requests/card/RequestFieldsBlock";
import { RequestHeader } from "@/components/requests/card/RequestHeader";
import { RequestStatusActions, RequestStatusStepper } from "@/components/requests/card/RequestProgress";
import { RequestComments, commentsQuery } from "@/components/requests/card/RequestComments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";

/** Основная работа + вторичные вкладки. Старые tab=initiator|office|files → work. */
const TABS = ["work", "comments", "history"] as const;
type Tab = (typeof TABS)[number];
const LEGACY_WORK = new Set(["initiator", "office", "files"]);

export const Route = createFileRoute("/_authenticated/requests_/$requestId")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; from?: "object" } => {
    const raw = search["tab"];
    if (typeof raw === "string" && LEGACY_WORK.has(raw)) {
      return { tab: "work", ...(search["from"] === "object" ? { from: "object" as const } : {}) };
    }
    const tab = TABS.find((t) => t === raw);
    return {
      ...(tab ? { tab } : {}),
      ...(search["from"] === "object" ? { from: "object" as const } : {}),
    };
  },
  component: RequestCard,
  head: () => ({ meta: [{ title: "Заявка — Лидер" }] }),
});

function RequestCard() {
  const { requestId } = Route.useParams();
  const { tab = "work", from } = Route.useSearch();
  const navigate = useNavigate({ from: "/requests/$requestId" });
  const { data: comments = [] } = useQuery(commentsQuery(requestId));
  const qc = useQueryClient();
  const refreshAll = useRefreshRequests();
  const { data: r, isLoading } = useQuery({
    queryKey: ["request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_requests").select("*").eq("id", requestId).maybeSingle();
      if (error) throw error;
      return data ? ({ ...(data as unknown as RequestRow), is_new: !!data.is_new, is_overdue: !!data.is_overdue }) : null;
    },
  });
  const { data: values = [] } = useQuery({
    queryKey: ["request", requestId, "values"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_field_values")
        .select("request_id, field_id, label, field_type, value")
        .eq("request_id", requestId);
      if (error) throw error;
      return (data ?? []) as FieldValue[];
    },
  });
  const filesKey = ["request", requestId, "files"];
  const { data: files = [] } = useQuery({
    queryKey: filesKey,
    queryFn: async () => {
      const [a, b] = await Promise.all([listFiles("request_field", [requestId]), listFiles("request", [requestId])]);
      return [...a, ...b].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });
  const { data: fields = [] } = useRequestFields(r?.request_type_id);
  const { data: profiles = [] } = useActiveProfiles();

  const initiatorRef = useRef<RequestFieldsHandle>(null);
  const officeRef = useRef<RequestFieldsHandle>(null);
  const [dirtyInitiator, setDirtyInitiator] = useState(false);
  const [dirtyOffice, setDirtyOffice] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = dirtyInitiator || dirtyOffice;

  const onDirtyInitiator = useCallback((d: boolean) => setDirtyInitiator(d), []);
  const onDirtyOffice = useCallback((d: boolean) => setDirtyOffice(d), []);

  const refresh = () => {
    refreshAll(requestId);
    qc.invalidateQueries({ queryKey: ["request", requestId] });
    qc.invalidateQueries({ queryKey: ["request-comments", requestId] });
  };

  const saveAll = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await initiatorRef.current?.save();
      await officeRef.current?.save();
      toast.success("Сохранено");
      refresh();
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  };

  const seenMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!r?.is_new || seenMarked.current === requestId) return;
    seenMarked.current = requestId;
    let cancelled = false;
    void (async () => {
      try {
        await markRequestSeen(requestId);
        if (cancelled) return;
        qc.setQueryData<RequestRow | null>(["request", requestId], (prev) =>
          prev ? { ...prev, is_new: false } : prev,
        );
        refreshAll(requestId);
      } catch {
        seenMarked.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [r?.is_new, requestId, qc, refreshAll]);

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!r) {
    return (
      <div>
        <BackLink />
        <p className="py-10 text-base text-muted-foreground">Заявка не найдена или у вас нет к ней доступа</p>
      </div>
    );
  }

  const backObjectId = from === "object" ? r.object_id : undefined;

  const active = fields.filter((f) => f.is_active && f.request_type_id === r.request_type_id);
  const activeIds = new Set(active.map((f) => f.id));
  const valueOf = (id: string) => values.find((v) => v.field_id === id)?.value;
  const missingRequired = active
    .filter((f) => f.is_required)
    .filter((f) => (f.field_type === "file" ? files.length === 0 : isEmptyValue(valueOf(f.id))))
    .map((f) => f.label);
  const orphan = values.filter((v) => !activeIds.has(v.field_id) && v.field_type !== "file");
  const doneByName = r.done_by ? profiles.find((p) => p.id === r.done_by)?.full_name ?? null : null;
  const readOnly = r.status === "done";
  const initiatorFields = active.filter((f) => f.filled_by === "initiator");
  const officeFields = active.filter((f) => f.filled_by === "office");
  const count = (n: number) => (n > 0 ? <span className="ml-1.5 tabular-nums text-muted-foreground">{n}</span> : null);
  const showBar = tab === "work";

  return (
    <div className={`flex w-full flex-col ${showBar ? "pb-24" : "pb-10"}`}>
      <BackLink objectId={backObjectId} />

      <div className="mt-4">
        <RequestHeader r={r} onChanged={refresh} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({
            search: { tab: v as Tab, ...(from === "object" ? { from: "object" as const } : {}) },
            replace: true,
          })
        }
        className="mt-5"
      >
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <TabsList
            className={cn(
              tabsListClass,
              "mb-0 grid h-9 w-full grid-cols-3 p-0.5 lg:w-[22rem] lg:shrink-0",
            )}
          >
            <TabsTrigger value="work" className={cn(tabTriggerClass, "justify-center px-2")}>
              Заполнение
            </TabsTrigger>
            <TabsTrigger value="comments" className={cn(tabTriggerClass, "justify-center px-2")}>
              Переписка{count(comments.length)}
            </TabsTrigger>
            <TabsTrigger value="history" className={cn(tabTriggerClass, "justify-center px-2")}>
              История
            </TabsTrigger>
          </TabsList>
          <RequestStatusStepper
            r={r}
            doneByName={doneByName}
            className="w-full lg:max-w-2xl lg:flex-1"
          />
        </div>

        <TabsContent value="work" className="mt-5 space-y-8">
          {initiatorFields.length === 0 && orphan.length === 0 ? (
            <p className="text-sm text-muted-foreground">У этого вида заявки нет полей прораба</p>
          ) : (
            <RequestFieldsBlock
              ref={initiatorRef}
              title="Данные прораба"
              requestId={r.id}
              fields={initiatorFields}
              values={values}
              orphanValues={orphan}
              readOnly={readOnly}
              onDirtyChange={onDirtyInitiator}
            />
          )}

          {officeFields.length > 0 && (
            <RequestFieldsBlock
              ref={officeRef}
              title="Данные офис-менеджера"
              hint="Заполняются перед отправкой заявки."
              requestId={r.id}
              fields={officeFields}
              values={values}
              orphanValues={[]}
              readOnly={readOnly}
              onDirtyChange={onDirtyOffice}
            />
          )}

          <section className="space-y-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">
                Файлы
                {files.length > 0 && (
                  <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{files.length}</span>
                )}
              </h2>
              {!readOnly && (
                <UploadButton
                  objectId={r.object_id}
                  entityType="request_field"
                  entityId={r.id}
                  kind="photo"
                  label="Добавить файлы"
                  onUploaded={() => {
                    qc.invalidateQueries({ queryKey: filesKey });
                    qc.invalidateQueries({ queryKey: ["history"] });
                  }}
                />
              )}
            </div>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">Файлов нет</p>
            ) : (
              <FileList files={files} />
            )}
          </section>
        </TabsContent>

        <TabsContent value="comments" className="mt-5">
          <RequestComments requestId={r.id} />
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <HistoryFeed filter={{ entityType: "request", entityId: r.id }} />
        </TabsContent>
      </Tabs>

      {showBar && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto sm:gap-3">
            {!readOnly && (
              <>
                <Button onClick={() => void saveAll()} disabled={!dirty || saving} className="h-9 shrink-0 px-4 text-sm">
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
                {dirty && (
                  <Button
                    variant="outline"
                    className="h-9 shrink-0 text-sm"
                    disabled={saving}
                    onClick={() => {
                      initiatorRef.current?.reset();
                      officeRef.current?.reset();
                      setDirtyInitiator(false);
                      setDirtyOffice(false);
                    }}
                  >
                    Отмена
                  </Button>
                )}
              </>
            )}
            <RequestStatusActions
              r={r}
              missingRequired={missingRequired}
              onChanged={refresh}
              className="ml-auto shrink-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BackLink({ objectId }: { objectId?: string | undefined } = {}) {
  if (objectId) {
    return (
      <Link
        to="/objects/$id"
        params={{ id: objectId }}
        search={{ tab: "requests" }}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> К объекту
      </Link>
    );
  }
  return (
    <Link to="/requests" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
      <ArrowLeft className="size-4" /> К заявкам
    </Link>
  );
}
