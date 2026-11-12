import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ClipboardPen, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { listFiles } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { useRequestFields } from "@/components/directories/request-types/data";
import { useActiveProfiles } from "@/components/objects/data";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { FileList, UploadButton } from "@/components/stages/page/FileButtons";
import { isEmptyValue, isValidEmail, looksLikeEmailField } from "@/components/requests/FieldInput";
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
import { useProfile } from "@/lib/profile";

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
  const me = useProfile();
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
  const [editing, setEditing] = useState(false);
  const [dirtyInitiator, setDirtyInitiator] = useState(false);
  const [dirtyOffice, setDirtyOffice] = useState(false);
  const [draftRev, setDraftRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const dirty = dirtyInitiator || dirtyOffice;

  useEffect(() => {
    setEditing(false);
    setDirtyInitiator(false);
    setDirtyOffice(false);
  }, [requestId]);

  const onDirtyInitiator = useCallback((d: boolean) => setDirtyInitiator(d), []);
  const onDirtyOffice = useCallback((d: boolean) => setDirtyOffice(d), []);
  const onDraftChange = useCallback(() => setDraftRev((n) => n + 1), []);

  const refresh = () => {
    refreshAll(requestId);
    qc.invalidateQueries({ queryKey: ["request", requestId] });
    qc.invalidateQueries({ queryKey: ["request", requestId, "values"] });
    qc.invalidateQueries({ queryKey: ["request-comments", requestId] });
  };

  const exitEditing = () => {
    initiatorRef.current?.reset();
    officeRef.current?.reset();
    setDirtyInitiator(false);
    setDirtyOffice(false);
    setEditing(false);
  };

  const saveAll = async (opts?: { silent?: boolean; keepEditing?: boolean }) => {
    setSaving(true);
    try {
      await initiatorRef.current?.save();
      await officeRef.current?.save();
      if (!opts?.silent) toast.success("Сохранено");
      await qc.invalidateQueries({ queryKey: ["request", requestId, "values"] });
      refreshAll(requestId);
      if (!opts?.keepEditing) setEditing(false);
    } catch (e) {
      showError(e);
      throw e;
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
  // Черновик из блоков важнее сервера — иначе «Отправить» блокируется, пока не нажмут «Сохранить».
  void draftRev;
  const valueOf = (id: string) => {
    if (initiatorRef.current?.hasField(id)) return initiatorRef.current.getValue(id);
    if (officeRef.current?.hasField(id)) return officeRef.current.getValue(id);
    return values.find((v) => v.field_id === id)?.value;
  };
  const isMissing = (f: (typeof active)[number]) => {
    if (f.field_type === "file") return files.length === 0;
    const raw = valueOf(f.id);
    if (isEmptyValue(raw)) return true;
    if (looksLikeEmailField(f) && (typeof raw !== "string" || !isValidEmail(raw))) return true;
    return false;
  };
  // До «Готова к отправке» обязательны поля прораба. До «Отправлена» — ещё и офиса.
  const requiredNow =
    r.status === "new"
      ? active.filter((f) => f.is_required && f.filled_by === "initiator")
      : r.status === "ready"
        ? active.filter((f) => f.is_required)
        : [];
  const missingRequired = requiredNow.filter(isMissing).map((f) => f.label);
  const orphan = values.filter((v) => !activeIds.has(v.field_id) && v.field_type !== "file");
  const doneByName = r.done_by ? profiles.find((p) => p.id === r.done_by)?.full_name ?? null : null;
  // Админ — всё в окне статуса; прораб/ПТО — поля initiator на «Новая»; офис — office до отправки.
  const isInitiatorRole = me.role_code === "foreman" || me.role_code === "pto";
  const isOfficeRole = me.role_code === "office";
  const statusAllowsInitiator = r.status === "new";
  const statusAllowsOffice = r.status === "new" || r.status === "ready";
  const canEditInitiator = (me.is_admin || isInitiatorRole) && statusAllowsInitiator;
  const canEditOffice = (me.is_admin || isOfficeRole) && statusAllowsOffice;
  const canEditFiles =
    (me.is_admin && statusAllowsOffice) ||
    (isInitiatorRole && statusAllowsInitiator) ||
    (isOfficeRole && statusAllowsOffice);
  const canEditAnything = canEditInitiator || canEditOffice || canEditFiles;
  const initiatorFields = active.filter((f) => f.filled_by === "initiator");
  const officeFields = active.filter((f) => f.filled_by === "office");
  const initiatorReadOnly = !editing || !canEditInitiator;
  const officeReadOnly = !editing || !canEditOffice;
  const filesReadOnly = !editing || !canEditFiles;
  const editableFields = [
    ...(canEditInitiator ? initiatorFields.filter((f) => f.field_type !== "file") : []),
    ...(canEditOffice ? officeFields.filter((f) => f.field_type !== "file") : []),
  ];
  const hasFilledData =
    editableFields.some((f) => !isEmptyValue(values.find((v) => v.field_id === f.id)?.value)) ||
    (canEditFiles && files.length > 0);
  const editButtonLabel = hasFilledData ? "Редактировать" : "Заполнить";
  const EditIcon = hasFilledData ? Pencil : ClipboardPen;
  const initiatorHint = !statusAllowsInitiator
    ? "Зафиксированы после «Готова к отправке»."
    : !canEditInitiator
      ? "Заполняет прораб или ПТО."
      : "Заполните и переведите заявку дальше.";
  const officeHint = !statusAllowsOffice
    ? "Зафиксированы после отправки заявки."
    : !canEditOffice
      ? "Заполняет офис-менеджер перед отправкой."
      : "Заполняются перед отправкой заявки.";
  const count = (n: number) =>
    n > 0 ? (
      <span
        aria-hidden
        className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold leading-none tabular-nums text-primary"
      >
        {n > 99 ? "99+" : n}
      </span>
    ) : null;
  const showBar = tab === "work";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
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
                {...(initiatorHint ? { hint: initiatorHint } : {})}
                requestId={r.id}
                fields={initiatorFields}
                values={values}
                orphanValues={orphan}
                readOnly={initiatorReadOnly}
                onDirtyChange={onDirtyInitiator}
                onDraftChange={onDraftChange}
              />
            )}

            {officeFields.length > 0 && (
              <RequestFieldsBlock
                ref={officeRef}
                title="Данные офис-менеджера"
                hint={officeHint}
                requestId={r.id}
                fields={officeFields}
                values={values}
                orphanValues={[]}
                readOnly={officeReadOnly}
                onDirtyChange={onDirtyOffice}
                onDraftChange={onDraftChange}
              />
            )}

            <section className="space-y-3 border-t border-border pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold tracking-tight">
                  Файлы
                  {files.length > 0 && (
                    <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{files.length}</span>
                  )}
                </h2>
                {!filesReadOnly && (
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
                {files.length === 0 && (
                  <span className="text-sm text-muted-foreground">Файлов нет</span>
                )}
              </div>
              {files.length > 0 && <FileList files={files} />}
            </section>
          </TabsContent>

          <TabsContent value="comments" className="mt-5">
            <RequestComments requestId={r.id} />
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            <HistoryFeed filter={{ entityType: "request", entityId: r.id }} />
          </TabsContent>
        </Tabs>
      </div>

      {showBar && (
        <div className="shrink-0 border-t border-border bg-background py-3">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            {canEditAnything && !editing && (
              <Button className="h-9 shrink-0 gap-1.5 px-4 text-sm" onClick={() => setEditing(true)}>
                <EditIcon className="size-3.5" />
                {editButtonLabel}
              </Button>
            )}
            {canEditAnything && editing && (
              <>
                <Button
                  variant="outline"
                  className="h-9 shrink-0 text-sm"
                  disabled={saving}
                  onClick={exitEditing}
                >
                  Отмена
                </Button>
                <Button
                  onClick={() => void saveAll().catch(() => undefined)}
                  disabled={!dirty || saving}
                  className="h-9 shrink-0 px-4 text-sm"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
              </>
            )}
            <RequestStatusActions
              r={r}
              missingRequired={missingRequired}
              beforeChange={() =>
                editing ? saveAll({ silent: true, keepEditing: true }) : Promise.resolve()
              }
              onChanged={() => {
                setEditing(false);
                refresh();
              }}
              className="shrink-0"
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
