import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoles } from "@/components/directories/stages/data";
import { Field } from "../common";
import { useRequestFields } from "./data";
import { cn } from "@/lib/utils";

const STATUSES = [
  { v: "ready", label: "Готова к отправке" },
  { v: "sent", label: "Отправлена" },
  { v: "accepted", label: "Принята заказчиком" },
  { v: "done", label: "Исполнена" },
] as const;

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

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Цепочка статусов фиксирована. Здесь задаётся, какая роль переводит заявку на статус и какие поля должны быть заполнены к этому шагу.
      </p>
      {steps.length === 0 && (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Шагов пока нет — после миграции 13 они появятся автоматически. Можно добавить вручную.
        </p>
      )}
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
  fields: { id: string; label: string }[];
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(step.role_code);
  const [status, setStatus] = useState(step.to_status);
  const [fieldIds, setFieldIds] = useState<string[]>(step.field_ids);
  const fieldsKey = step.field_ids.join(",");

  useEffect(() => {
    setRole(step.role_code);
    setStatus(step.to_status);
    setFieldIds(step.field_ids);
  }, [step.id, step.role_code, step.to_status, fieldsKey]);

  const persist = useMutation({
    mutationFn: async (next: { role_code: string; to_status: string; field_ids: string[] }) => {
      const { error } = await supabase
        .from("request_type_scenario_steps")
        .update({ role_code: next.role_code, to_status: next.to_status })
        .eq("id", step.id);
      if (error) throw error;
      await supabase.from("request_type_scenario_step_fields").delete().eq("step_id", step.id);
      if (next.field_ids.length) {
        const { error: e2 } = await supabase
          .from("request_type_scenario_step_fields")
          .insert(next.field_ids.map((field_id) => ({ step_id: step.id, field_id })));
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
    setRole(next.role_code);
    setStatus(next.to_status);
    setFieldIds(next.field_ids);
    persist.mutate(next);
  };

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
      {fields.length > 0 && (
        <div className="mt-5">
          <Field label="Обязательные поля к этому шагу">
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => {
                const on = fieldIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={readOnly || persist.isPending}
                    onClick={() =>
                      save({
                        role_code: role,
                        to_status: status,
                        field_ids: on ? fieldIds.filter((x) => x !== f.id) : [...fieldIds, f.id],
                      })
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs",
                      on
                        ? "border-signal bg-accent font-medium"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}
    </li>
  );
}
