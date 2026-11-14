import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoles } from "@/components/directories/stages/data";
import { Field } from "../common";
import { useRequestFields, type RequestField } from "./data";

const STATUSES = [
  { v: "ready", label: "Готова к отправке" },
  { v: "sent", label: "Отправлена" },
  { v: "accepted", label: "Принята заказчиком" },
  { v: "done", label: "Исполнена" },
] as const;

/** На этих статусах обычно только подтверждают переход — поля уже заполнены на ready/sent. */
const STATUSES_WITH_REQUIRED_FIELDS = new Set(["ready", "sent"]);

/** Чьи поля показывать в обязательных для шага — по роли перехода. */
function filledByForRole(roleCode: string): RequestField["filled_by"] | "all" {
  if (roleCode === "office") return "office";
  if (roleCode === "foreman" || roleCode === "pto") return "initiator";
  return "all";
}

function fieldsForStepRole(fields: RequestField[], roleCode: string): RequestField[] {
  const who = filledByForRole(roleCode);
  if (who === "all") return fields;
  return fields.filter((f) => f.filled_by === who);
}

type Step = {
  id: string;
  step_no: number;
  role_code: string;
  to_status: string;
  sort: number;
  field_ids: string[];
};

const KEY = (typeId: string) => ["request-type-scenario", typeId] as const;

function useScenario(typeId: string) {
  return useQuery({
    queryKey: KEY(typeId),
    enabled: !!typeId,
    queryFn: async (): Promise<Step[]> => {
      const { data: steps, error } = await supabase
        .from("request_type_scenario_steps")
        .select("id, step_no, role_code, to_status, sort")
        .eq("request_type_id", typeId)
        .is("deleted_at", null)
        .order("step_no");
      if (error) throw error;
      const ids = (steps ?? []).map((s) => s.id);
      let fields: { step_id: string; field_id: string }[] = [];
      if (ids.length) {
        const { data, error: e2 } = await supabase
          .from("request_type_scenario_step_fields")
          .select("step_id, field_id")
          .in("step_id", ids);
        if (e2) throw e2;
        fields = data ?? [];
      }
      return (steps ?? []).map((s) => ({
        ...s,
        field_ids: fields.filter((f) => f.step_id === s.id).map((f) => f.field_id),
      }));
    },
  });
}

/** Редактор сценария вида заявки: роль и обязательные поля на каждый переход статуса. */
export function RequestTypeScenario({ typeId, readOnly }: { typeId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { data: steps = [], isLoading } = useScenario(typeId);
  const { data: roles = [] } = useRoles();
  const { data: fields = [] } = useRequestFields(typeId);
  const activeFields = useMemo(() => fields.filter((f) => f.is_active), [fields]);

  const refresh = () => qc.invalidateQueries({ queryKey: KEY(typeId) });

  const add = useMutation({
    mutationFn: async () => {
      const nextNo = (steps.at(-1)?.step_no ?? 0) + 1;
      const used = new Set(steps.map((s) => s.to_status));
      const nextStatus = STATUSES.find((s) => !used.has(s.v))?.v ?? "done";
      const { error } = await supabase.from("request_type_scenario_steps").insert({
        request_type_id: typeId,
        step_no: nextNo,
        role_code: "office",
        to_status: nextStatus,
        sort: nextNo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Шаг добавлен");
      refresh();
    },
    onError: showError,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Цепочка статусов фиксирована. На шаге: кто переводит заявку дальше и какие{" "}
        <span className="text-foreground/80">свои</span> поля этой роли обязательны перед переходом (не чужие —
        прорабские поля на шаге офиса не показываются).
      </p>
      {isLoading ? (
        <ol className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="rounded-md border border-border bg-card p-4 space-y-3">
              <Skeleton height={16} width="40%" />
              <Skeleton height={14} width="70%" />
              <Skeleton height={36} width="100%" borderRadius={6} />
            </li>
          ))}
        </ol>
      ) : steps.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Шагов пока нет — после миграции 13 они появятся автоматически. Можно добавить вручную.
        </p>
      ) : null}
      {!isLoading && (
        <>
          <ol className="space-y-3">
            {steps.map((s) => (
              <StepCard
                key={s.id}
                step={s}
                roles={roles}
                fields={activeFields}
                readOnly={!!readOnly}
                onSaved={refresh}
              />
            ))}
          </ol>
          {!readOnly && steps.length < STATUSES.length && (
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 px-3 text-sm"
              onClick={() => add.mutate()}
              disabled={add.isPending}
            >
              <Plus className="size-4" />
              Добавить шаг
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function StepCard({
  step,
  roles,
  fields,
  readOnly,
  onSaved,
}: {
  step: Step;
  roles: { code: string; name: string }[];
  fields: RequestField[];
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(step.role_code);
  const [status, setStatus] = useState(step.to_status);
  const [fieldIds, setFieldIds] = useState<string[]>(step.field_ids);
  const fieldsKey = step.field_ids.join(",");
  const roleFields = useMemo(() => fieldsForStepRole(fields, role), [fields, role]);
  const roleFieldIdSet = useMemo(() => new Set(roleFields.map((f) => f.id)), [roleFields]);

  useEffect(() => {
    setRole(step.role_code);
    setStatus(step.to_status);
    setFieldIds(step.field_ids);
  }, [step.id, step.role_code, step.to_status, fieldsKey]);

  const showRequiredFields = STATUSES_WITH_REQUIRED_FIELDS.has(status);

  const persist = useMutation({
    mutationFn: async (next: { role_code: string; to_status: string; field_ids: string[] }) => {
      const allowFields = STATUSES_WITH_REQUIRED_FIELDS.has(next.to_status);
      const allowed = new Set(fieldsForStepRole(fields, next.role_code).map((f) => f.id));
      const cleaned = allowFields ? next.field_ids.filter((id) => allowed.has(id)) : [];
      const { error } = await supabase
        .from("request_type_scenario_steps")
        .update({ role_code: next.role_code, to_status: next.to_status })
        .eq("id", step.id);
      if (error) throw error;
      await supabase.from("request_type_scenario_step_fields").delete().eq("step_id", step.id);
      if (cleaned.length) {
        const { error: e2 } = await supabase
          .from("request_type_scenario_step_fields")
          .insert(cleaned.map((field_id) => ({ step_id: step.id, field_id })));
        if (e2) throw e2;
      }
    },
    onSuccess: onSaved,
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("request_type_scenario_steps")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Шаг удалён");
      onSaved();
    },
    onError: showError,
  });

  const save = (next: { role_code: string; to_status: string; field_ids: string[] }) => {
    const allowFields = STATUSES_WITH_REQUIRED_FIELDS.has(next.to_status);
    const allowed = new Set(fieldsForStepRole(fields, next.role_code).map((f) => f.id));
    const cleaned = allowFields ? next.field_ids.filter((id) => allowed.has(id)) : [];
    setRole(next.role_code);
    setStatus(next.to_status);
    setFieldIds(cleaned);
    persist.mutate({ ...next, field_ids: cleaned });
  };

  const whoLabel =
    filledByForRole(role) === "office"
      ? "офис-менеджера"
      : filledByForRole(role) === "initiator"
        ? "прораба / ПТО"
        : "заявки";

  return (
    <li className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Шаг {step.step_no}</span>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-danger"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            title="Удалить шаг"
            aria-label="Удалить шаг"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Роль">
          <Select
            value={role}
            onValueChange={(v) => save({ role_code: v, to_status: status, field_ids: fieldIds })}
            disabled={readOnly || persist.isPending}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.code} value={r.code} className="text-sm">{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Переход в статус">
          <Select
            value={status}
            onValueChange={(v) => save({ role_code: role, to_status: v, field_ids: fieldIds })}
            disabled={readOnly || persist.isPending}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.v} value={s.v} className="text-sm">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-5 space-y-2.5">
        {showRequiredFields ? (
          <>
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Обязательные поля {whoLabel} к этому шагу
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Только поля, которые заполняет эта роль (см. вкладку «Поля заявки» → «Кто заполняет»).
                Отмеченные нужно заполнить, прежде чем роль сможет перевести заявку дальше.
              </p>
            </div>
            {roleFields.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                У этой роли нет своих полей в виде заявки — обязательные отмечать нечего.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {roleFields.map((f) => {
                  const on = fieldIds.includes(f.id) && roleFieldIdSet.has(f.id);
                  const id = `scenario-field-${step.id}-${f.id}`;
                  return (
                    <li key={f.id}>
                      <label
                        htmlFor={id}
                        className="flex h-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1 leading-snug">{f.label}</span>
                        <Switch
                          id={id}
                          checked={on}
                          disabled={readOnly || persist.isPending}
                          onCheckedChange={(v) =>
                            save({
                              role_code: role,
                              to_status: status,
                              field_ids: v ? [...fieldIds, f.id] : fieldIds.filter((x) => x !== f.id),
                            })
                          }
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            На этом шаге обычно ничего заполнять не нужно — только смена статуса (поля уже внесены на
            «Готова к отправке» / «Отправлена»).
          </p>
        )}
      </div>
    </li>
  );
}
