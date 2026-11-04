import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { tabsListClass, tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OBJECTS_KEY } from "@/components/objects/data";
import { ObjectCardFields, draftToPayload, validateDraft, type ObjectDraft } from "@/components/objects/ObjectCardFields";
import { MembersPicker } from "@/components/objects/MembersPicker";
import { StagesPicker, useAvailableTemplates } from "@/components/objects/StagesPicker";
import { StatusBadge, useObjectStages } from "@/components/stages/data";

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
    <div>
      {back}
      <h1 className="mb-4 text-xl font-bold">{obj.name}</h1>
      <Tabs defaultValue="card">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="card" className={tabTriggerClass}>Карточка</TabsTrigger>
          <TabsTrigger value="members" className={tabTriggerClass}>Участники</TabsTrigger>
          <TabsTrigger value="stages" className={tabTriggerClass}>Этапы</TabsTrigger>
        </TabsList>
        <TabsContent value="card">
          <CardTab id={id} initial={draft} />
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

function CardTab({ id, initial }: { id: string; initial: ObjectDraft }) {
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
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => save.mutate(undefined)} disabled={save.isPending} className="h-9 px-5 text-sm">
          {save.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
        {archived ? (
          <Button
            variant="outline"
            size="icon"
            onClick={() => save.mutate({ status: "in_work" })}
            disabled={save.isPending}
            title="Вернуть из архива"
            aria-label="Вернуть из архива"
          >
            <ArchiveRestore className="size-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            onClick={() => save.mutate({ status: "completed" })}
            disabled={save.isPending}
            title="Завершить и перенести в архив"
            aria-label="Завершить и перенести в архив"
          >
            <Archive className="size-4" />
          </Button>
        )}
      </div>
    </div>
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
  const { data: stages = [], isLoading } = useObjectStages(id);
  const { templates } = useAvailableTemplates(stages.map((s) => s.template_id).filter((x): x is string => !!x));

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
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          Исключённый этап не учитывается в готовности и не подсвечивается. Его можно вернуть в любой момент.
        </p>
        <Button
          onClick={() => setAdding(true)}
          size="icon"
          title="Добавить этапы из справочника"
          aria-label="Добавить этапы из справочника"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border border-border bg-card">
        {stages.length === 0 && <p className="p-4 text-sm text-muted-foreground">Этапов нет</p>}
        {stages.map((s) => (
          <div key={s.id} className={`flex flex-wrap items-center gap-4 px-4 py-2 text-sm ${s.is_excluded ? "bg-muted/50" : ""}`}>
            <span className="w-8 font-semibold">{s.number}</span>
            <span className={`flex-1 ${s.is_excluded ? "text-muted-foreground line-through" : ""}`}>{s.name}</span>
            {!s.is_excluded && (
              <StatusBadge name={s.status_name} color={s.status_color} />
            )}
            <Button
              variant="outline"
              className="h-8 text-sm"
              disabled={exclude.isPending}
              onClick={() => exclude.mutate({ stageId: s.id, excluded: !s.is_excluded })}
            >
              {s.is_excluded ? "Вернуть" : "Исключить"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Добавить этапы из справочника</DialogTitle>
          </DialogHeader>
          <StagesPicker templates={templates} selected={picked} onChange={setPicked} />
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
