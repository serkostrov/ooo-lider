import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
import { tabsListClass, tabTriggerClass, thLabelClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OBJECTS_KEY, useActiveProfiles, type ProfileShort } from "@/components/objects/data";
import { ObjectCardFields, draftToPayload, validateDraft, type ObjectDraft } from "@/components/objects/ObjectCardFields";
import { MembersPicker } from "@/components/objects/MembersPicker";
import { StagesPicker, useAvailableTemplates } from "@/components/objects/StagesPicker";
import { ReorderModeButton } from "@/components/directories/ReorderModeButton";
import { Reorderable } from "@/components/directories/stages/Reorderable";
import { StatusBadge, useObjectStages, type ObjectStage } from "@/components/stages/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/objects_/$id_/edit")({
  component: EditObjectPage,
  head: () => ({ meta: [{ title: "Редактирование объекта — Лидер" }] }),
});


function EditObjectPage() {
  const { id } = Route.useParams();
  const { is_admin } = useProfile();
  const { data: obj, isLoading } = useQuery({
    queryKey: ["object-raw", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objects")
        .select("id, name, address, customer_id, object_type, contract_start, contract_end, responsible_id, status, notes, curator_contact_id, technadzor_contact_id, technadzor_ehz_contact_id")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const back = (
    <Link to="/objects/$id" params={{ id }} className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
      <ArrowLeft className="size-4" /> К объекту
    </Link>
  );

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!obj || !is_admin) {
    return (
      <div>
        {back}
        <p className="py-10 text-base text-muted-foreground">
          {obj ? "Редактировать объект может только администратор или руководитель" : "Объект не найден"}
        </p>
      </div>
    );
  }

  const draft: ObjectDraft = {
    name: obj.name,
    address: obj.address ?? "",
    customer_id: obj.customer_id ?? "",
    object_type: obj.object_type,
    contract_start: obj.contract_start ?? "",
    contract_end: obj.contract_end ?? "",
    responsible_id: obj.responsible_id ?? "",
    curator_contact_id: obj.curator_contact_id ?? "",
    technadzor_contact_id: obj.technadzor_contact_id ?? "",
    technadzor_ehz_contact_id: obj.technadzor_ehz_contact_id ?? "",
    status: obj.status as ObjectDraft["status"],
    notes: obj.notes ?? "",
  };

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
      {back}
      <h1 className="mb-4 text-xl font-bold">{obj.name}</h1>
      <Tabs defaultValue="card">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="card" className={tabTriggerClass}>Карточка</TabsTrigger>
          <TabsTrigger value="members" className={tabTriggerClass}>Участники</TabsTrigger>
          <TabsTrigger value="stages" className={tabTriggerClass}>Этапы</TabsTrigger>
        </TabsList>
        <TabsContent value="card">
          <CardTab id={id} name={obj.name} initial={draft} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab id={id} />
        </TabsContent>
        <TabsContent value="stages">
          <StagesTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useInvalidateObject(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: OBJECTS_KEY });
    qc.invalidateQueries({ queryKey: ["object-raw", id] });
    qc.invalidateQueries({ queryKey: ["object-stages", id] });
    qc.invalidateQueries({ queryKey: ["object-members", id] });
  };
}

function CardTab({ id, name, initial }: { id: string; name: string; initial: ObjectDraft }) {
  const [draft, setDraft] = useState(initial);
  const invalidate = useInvalidateObject(id);

  const save = useMutation({
    mutationFn: async (override?: Partial<ObjectDraft>) => {
      const d = { ...draft, ...override };
      const err = validateDraft(d);
      if (err) throw new Error(err);
      const payload = draftToPayload(d);
      const { error } = await supabase
        .from("objects")
        .update({
          ...payload,
          completed_at: payload.status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
      return d;
    },
    onSuccess: (d) => {
      setDraft(d);
      toast.success(d.status === "completed" && initial.status !== "completed" ? "Объект перенесён в архив" : "Сохранено");
      invalidate();
    },
    onError: showError,
  });

  const archived = draft.status === "completed";

  return (
    <div className="space-y-5">
      <ObjectCardFields value={draft} onChange={setDraft} showStatus />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save.mutate(undefined)} disabled={save.isPending} className="h-9 px-5 text-sm">
          {save.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
        {archived ? (
          <Button
            variant="outline"
            onClick={() => save.mutate({ status: "in_work" })}
            disabled={save.isPending}
            className="h-9 gap-1.5 px-3 text-sm"
          >
            <ArchiveRestore className="size-4" />
            Вернуть из архива
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => save.mutate({ status: "completed" })}
            disabled={save.isPending}
            className="h-9 gap-1.5 px-3 text-sm"
          >
            <Archive className="size-4" />
            В архив
          </Button>
        )}
        <div className="ml-auto">
          <DeleteObjectButton id={id} name={name} disabled={save.isPending} />
        </div>
      </div>
    </div>
  );
}

/** Мягкое удаление объекта только после подтверждения в диалоге. */
function DeleteObjectButton({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("objects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Не удалось удалить объект");
    },
    onSuccess: () => {
      toast.success("Объект удалён");
      qc.invalidateQueries({ queryKey: OBJECTS_KEY });
      qc.invalidateQueries({ queryKey: ["object-raw", id] });
      setOpen(false);
      void navigate({ to: "/objects" });
    },
    onError: showError,
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || m.isPending}
        className="h-9 gap-1.5 px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
        Удалить
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить объект?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              «{name}» исчезнет из списка и станет недоступен. Для завершения работ лучше перенести объект в архив.
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
              {m.isPending ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MembersTab({ id }: { id: string }) {
  const invalidate = useInvalidateObject(id);
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["object-members", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("object_members").select("profile_id").eq("object_id", id);
      if (error) throw error;
      return (data ?? []).map((r) => r.profile_id as string);
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ profileId, on }: { profileId: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from("object_members").insert({ object_id: id, profile_id: profileId })
        : await supabase.from("object_members").delete().eq("object_id", id).eq("profile_id", profileId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });
  if (isLoading) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Изменения сохраняются сразу. Участник видит объект, его этапы и заявки.
      </p>
      <MembersPicker
        value={members}
        disabled={toggle.isPending}
        onToggle={(profileId, on) => toggle.mutate({ profileId, on })}
      />
    </div>
  );
}

function StagesTab({ id }: { id: string }) {
  const invalidate = useInvalidateObject(id);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reordering, setReordering] = useState(false);
  const { data: stages = [], isLoading } = useObjectStages(id);
  const { templates } = useAvailableTemplates();
  const { data: memberIds = [] } = useQuery({
    queryKey: ["object-members", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("object_members").select("profile_id").eq("object_id", id);
      if (error) throw error;
      return (data ?? []).map((r) => r.profile_id as string);
    },
  });
  const { data: profiles = [] } = useActiveProfiles();
  const memberProfiles: ProfileShort[] = profiles.filter((p) => memberIds.includes(p.id));

  const tops = stages.filter((s) => !s.parent_id);
  const childrenOf = (parentId: string) => stages.filter((s) => s.parent_id === parentId);

  const exclude = useMutation({
    mutationFn: async ({ stageId, excluded }: { stageId: string; excluded: boolean }) => {
      const { error } = await supabase.rpc("stage_set_excluded", { p_stage_id: stageId, p_excluded: excluded });
      if (error) throw error;
      return excluded;
    },
    onSuccess: (excluded) => {
      toast.success(excluded ? "Этап исключён из работы" : "Этап возвращён в работу");
      invalidate();
    },
    onError: showError,
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc("reorder_object_stages", {
        p_object_id: id,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: showError,
  });

  const add = useMutation({
    mutationFn: async () => {
      if (picked.length === 0) throw new Error("Отметьте хотя бы один этап");
      const { data, error } = await supabase.rpc("add_object_stages", { p_object_id: id, p_template_ids: picked });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Добавлено этапов: ${n}`);
      setAdding(false);
      setPicked([]);
      invalidate();
    },
    onError: showError,
  });

  if (isLoading) return null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {reordering
            ? "Перетащите этапы за ручку. Номера пересчитаются сами. Один шаблон можно добавить несколько раз."
            : "Один шаблон можно добавить несколько раз. Исключённый этап не учитывается в готовности."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {tops.length > 1 && (
            <ReorderModeButton
              active={reordering}
              onChange={setReordering}
              disabled={reorder.isPending}
            />
          )}
          <Button
            onClick={() => setAdding(true)}
            size="icon"
            title="Добавить этапы из справочника"
            aria-label="Добавить этапы из справочника"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {tops.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">Этапов нет</p>
      ) : (
        <Reorderable
          items={tops}
          disabled={!reordering || reorder.isPending}
          onMove={(ids) => reorder.mutate(ids)}
          header={
            <>
              <span className={cn(thLabelClass, "w-10 shrink-0")}>N</span>
              <span className={cn(thLabelClass, "min-w-0 flex-1")}>Этап</span>
              <span className={cn(thLabelClass, "hidden w-40 shrink-0 sm:block")}>Исполнитель</span>
              <span className={cn(thLabelClass, "hidden w-40 shrink-0 md:block")}>Адресат</span>
              <span className={cn(thLabelClass, "w-[7.5rem] shrink-0")}>Статус</span>
              <span className="w-[5.5rem] shrink-0" aria-hidden />
            </>
          }
          render={(s) => (
            <StageEditRow
              s={s}
              substages={childrenOf(s.id)}
              excludePending={exclude.isPending}
              onExclude={(excluded) => exclude.mutate({ stageId: s.id, excluded })}
              onReorderChildren={(ids) => reorder.mutate(ids)}
              reordering={reordering}
              reorderPending={reorder.isPending}
              onExcludeChild={(stageId, excluded) => exclude.mutate({ stageId, excluded })}
            />
          )}
        />
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Добавить этапы из справочника</DialogTitle>
          </DialogHeader>
          <StagesPicker templates={templates} selected={picked} onChange={setPicked} members={memberProfiles} />
          <div className="flex gap-3 pt-2">
            <Button onClick={() => add.mutate()} disabled={add.isPending || picked.length === 0} className="h-9 px-4 text-sm">
              {add.isPending ? "Добавление…" : `Добавить (${picked.length})`}
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)} className="h-9 text-sm">
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stagePerson(s: ObjectStage, kind: "executor" | "confirmer") {
  if (kind === "executor") {
    return s.executor_name?.trim() || null;
  }
  return s.confirmer_name?.trim() || s.confirmer_role_name?.trim() || null;
}

function StagePeopleCells({ s }: { s: ObjectStage }) {
  const executor = stagePerson(s, "executor");
  const confirmer = stagePerson(s, "confirmer");
  return (
    <>
      <span
        className="hidden w-40 shrink-0 truncate text-muted-foreground sm:block"
        title={executor ?? undefined}
      >
        {executor ?? "—"}
      </span>
      <span
        className="hidden w-40 shrink-0 truncate text-muted-foreground md:block"
        title={confirmer ?? undefined}
      >
        {confirmer ?? "—"}
      </span>
    </>
  );
}

function StageEditRow({
  s,
  substages,
  excludePending,
  onExclude,
  onReorderChildren,
  reordering,
  reorderPending,
  onExcludeChild,
}: {
  s: ObjectStage;
  substages: ObjectStage[];
  excludePending: boolean;
  onExclude: (excluded: boolean) => void;
  onReorderChildren: (ids: string[]) => void;
  reordering: boolean;
  reorderPending: boolean;
  onExcludeChild: (stageId: string, excluded: boolean) => void;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2 py-1">
      <div className={`flex min-w-0 items-center gap-3 text-sm ${s.is_excluded ? "opacity-70" : ""}`}>
        <span className="w-10 shrink-0 font-semibold tabular-nums">{s.code}</span>
        <span className={`min-w-0 flex-1 truncate ${s.is_excluded ? "text-muted-foreground line-through" : ""}`} title={s.name}>
          {s.name}
        </span>
        <StagePeopleCells s={s} />
        <span className="flex w-[7.5rem] shrink-0 items-center">
          {!s.is_excluded ? <StatusBadge name={s.status_name} color={s.status_color} /> : null}
        </span>
        <Button
          variant="outline"
          className="h-8 w-[5.5rem] shrink-0 text-sm"
          disabled={excludePending || reordering}
          onClick={(e) => {
            e.stopPropagation();
            onExclude(!s.is_excluded);
          }}
        >
          {s.is_excluded ? "Вернуть" : "Исключить"}
        </Button>
      </div>
      {substages.length > 0 && (
        <div className="ml-6 border-l border-border/70 pl-3">
          <Reorderable
            items={substages}
            disabled={!reordering || reorderPending}
            onMove={onReorderChildren}
            render={(child) => (
              <div
                className={`flex min-w-0 flex-1 items-center gap-3 py-1 text-sm ${child.is_excluded ? "opacity-70" : ""}`}
              >
                <span className="w-12 shrink-0 font-semibold tabular-nums text-muted-foreground">{child.code}</span>
                <span
                  className={`min-w-0 flex-1 truncate ${child.is_excluded ? "text-muted-foreground line-through" : ""}`}
                  title={child.name}
                >
                  {child.name}
                </span>
                <StagePeopleCells s={child} />
                <span className="flex w-[7.5rem] shrink-0 items-center">
                  {!child.is_excluded ? (
                    <StatusBadge name={child.status_name} color={child.status_color} />
                  ) : null}
                </span>
                <Button
                  variant="outline"
                  className="h-8 w-[5.5rem] shrink-0 text-sm"
                  disabled={excludePending || reordering}
                  onClick={(e) => {
                    e.stopPropagation();
                    onExcludeChild(child.id, !child.is_excluded);
                  }}
                >
                  {child.is_excluded ? "Вернуть" : "Исключить"}
                </Button>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
