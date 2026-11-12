import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, showError } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/DateField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditSheet, Field } from "@/components/directories/common";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { useObjects } from "@/components/objects/data";
import { useObjectStages } from "@/components/stages/data";
import { useRefreshRequests, useRepresentatives } from "@/components/requests/data";

const NONE = "__none";

export function NewRequestDialog({
  open,
  onOpenChange,
  objectId: presetObjectId,
  typeId: presetTypeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectId?: string | undefined;
  typeId?: string | undefined;
}) {
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Новая заявка"
      className="sm:max-w-2xl"
    >
      {open && (
        <NewRequestForm
          key={`${presetObjectId ?? ""}-${presetTypeId ?? ""}-${open}`}
          presetObjectId={presetObjectId}
          presetTypeId={presetTypeId}
          onDone={() => onOpenChange(false)}
        />
      )}
    </EditSheet>
  );
}

function NewRequestForm({
  presetObjectId,
  presetTypeId,
  onDone,
}: {
  presetObjectId?: string | undefined;
  presetTypeId?: string | undefined;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const refresh = useRefreshRequests();
  const { data: objects = [] } = useObjects();
  const { data: types = [] } = useRequestTypes();
  const { data: reps = [] } = useRepresentatives();

  const [objectId, setObjectId] = useState(presetObjectId ?? "");
  const [typeId, setTypeId] = useState(presetTypeId ?? "");
  const [callDate, setCallDate] = useState("");
  const [repId, setRepId] = useState("");
  const [stageId, setStageId] = useState("");

  const type = types.find((t) => t.id === typeId);
  const { data: stages = [] } = useObjectStages(objectId);
  const openStages = objectId ? stages.filter((s) => !s.is_closed && !s.is_excluded) : [];
  const activeObjects = objects.filter((o) => o.status !== "completed");

  const create = useMutation({
    mutationFn: async () => {
      if (!objectId) throw new Error("Выберите объект");
      if (!typeId) throw new Error("Выберите вид заявки");
      if (!callDate) throw new Error("Укажите дату вызова");
      if (type?.uses_representatives && !repId) throw new Error("Выберите, кого вызываем");

      const args: {
        p_object_id: string;
        p_request_type_id: string;
        p_call_date: string;
        p_values: { field_id: string; value: unknown }[];
        p_representative_id?: string;
        p_stage_id?: string;
      } = { p_object_id: objectId, p_request_type_id: typeId, p_call_date: callDate, p_values: [] };
      if (repId) args.p_representative_id = repId;
      if (stageId) args.p_stage_id = stageId;
      const { data, error } = await supabase.rpc("request_create", args as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Заявка создана");
      refresh(id);
      onDone();
      navigate({
        to: "/requests/$requestId",
        params: { requestId: id },
        search: presetObjectId ? { from: "object" } : {},
      });
    },
    onError: showError,
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <p className="-mt-1 text-sm text-muted-foreground">
        Дата формирования: сегодня, {formatDate(mskToday())}. Пикеты и остальные данные прораб заполнит в карточке и
        переведёт заявку дальше.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Объект" required>
          <Select
            value={objectId}
            onValueChange={(v) => {
              setObjectId(v);
              setStageId("");
            }}
            disabled={!!presetObjectId}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите объект" />
            </SelectTrigger>
            <SelectContent>
              {activeObjects.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-sm">
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Вид заявки" required>
          <Select
            value={typeId}
            onValueChange={(v) => {
              setTypeId(v);
              setRepId("");
            }}
            disabled={!!presetTypeId}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите вид" />
            </SelectTrigger>
            <SelectContent>
              {types
                .filter((t) => t.is_active)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-sm">
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Дата вызова" required>
        <DateField value={callDate} onChange={setCallDate} />
      </Field>

      {type?.uses_representatives && (
        <Field label="Кого вызываем" required>
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите из справочника" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-sm">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {objectId && openStages.length > 0 && (
        <Field label="Связать с этапом (необязательно)">
          <Select value={stageId || NONE} onValueChange={(v) => setStageId(v === NONE ? "" : v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-sm">
                Без этапа
              </SelectItem>
              {openStages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-sm">
                  {s.number}. {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <div className="border-t border-border pt-4">
        <Button type="submit" disabled={create.isPending} className="h-9 w-full text-sm">
          {create.isPending ? "Создание…" : "Создать заявку"}
        </Button>
      </div>
    </form>
  );
}
