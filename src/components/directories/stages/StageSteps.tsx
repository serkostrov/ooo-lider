import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "../common";
import { DirectoryListSkeleton } from "../DirectorySkeleton";
import { Reorderable } from "./Reorderable";
import { ReorderModeButton } from "../ReorderModeButton";
import { ACTION_KINDS, toIntOrNull, useRoles } from "./data";

type Step = {
  id: string;
  step_no: number;
  role_code: string;
  action: string;
  action_kind: "fill" | "attach" | "send" | "confirm" | "other";
  duration_days: number | null;
};

/**
 * Перенумерация шагов 1..n в заданном порядке.
 * Уникальный индекс (template_id, step_no) проверяется на каждой строке, поэтому
 * сначала уводим номера во временный диапазон, затем ставим окончательные.
 */
async function renumber(ids: string[]) {
  const pass = async (f: (i: number) => number) => {
    const results = await Promise.all(
      ids.map((id, i) => supabase.from("stage_template_steps").update({ step_no: f(i) }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  };
  await pass((i) => 100000 + i);
  await pass((i) => i + 1);
}

export function StageSteps({ templateId, readOnly }: { templateId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const key = ["dir-stage-steps", templateId];
  const { data: roles = [] } = useRoles();
  const { data: steps = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_template_steps")
        .select("id, step_no, role_code, action, action_kind, duration_days")
        .eq("template_id", templateId)
        .is("deleted_at", null)
        .order("step_no");
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Omit<Step, "id" | "step_no">> }) => {
      const { error } = await supabase.from("stage_template_steps").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => {
      showError(e);
      refresh();
    },
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      qc.setQueryData<Step[]>(key, (old) =>
        ids.map((id, i) => ({ ...(old ?? []).find((s) => s.id === id)!, step_no: i + 1 })),
      );
      await renumber(ids);
    },
    onSettled: refresh,
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Освобождаем номер: удалённая строка остаётся в таблице и участвует в уникальном индексе.
      const { error } = await supabase
        .from("stage_template_steps")
        .update({ deleted_at: new Date().toISOString(), step_no: -(Date.now() % 1000000000) })
        .eq("id", id);
      if (error) throw error;
      await renumber(steps.filter((s) => s.id !== id).map((s) => s.id));
    },
    onSuccess: () => {
      toast.success("Шаг удалён");
      refresh();
    },
    onError: (e) => {
      showError(e);
      refresh();
    },
  });

  const [reordering, setReordering] = useState(false);
  const [role, setRole] = useState("");
  const [action, setAction] = useState("");
  const [kind, setKind] = useState<Step["action_kind"]>("other");
  const [days, setDays] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      if (!role) throw new Error("Выберите роль");
      if (!action.trim()) throw new Error("Опишите действие");
      const d = toIntOrNull(days);
      if (d === "bad") throw new Error("Срок — целое число от 0 или пусто");
      const step_no = steps.reduce((m, s) => Math.max(m, s.step_no), 0) + 1;
      const { error } = await supabase.from("stage_template_steps").insert({
        template_id: templateId,
        step_no,
        role_code: role,
        action: action.trim(),
        action_kind: kind,
        duration_days: d,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAction("");
      setDays("");
      setKind("other");
      refresh();
    },
    onError: showError,
  });

  return (
    <div className="w-full space-y-4">
      <p className="text-sm text-muted-foreground">
        Сценарий копируется на объект при добавлении этапа. Изменения не затрагивают уже созданные объекты.
      </p>
      {isLoading ? (
        <DirectoryListSkeleton rows={4} />
      ) : steps.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Шагов пока нет</p>
      ) : null}
      {!isLoading && steps.length > 0 && !readOnly && (
        <div className="flex justify-end">
          <ReorderModeButton active={reordering} onChange={setReordering} />
        </div>
      )}
      {!isLoading && (
      <Reorderable
        items={steps}
        disabled={readOnly || !reordering}
        onMove={(ids) => reorder.mutate(ids)}
        render={(s) => (
          <StepRow
            key={s.id}
            step={s}
            roles={roles}
            readOnly={readOnly}
            onPatch={(patch) => update.mutate({ id: s.id, patch })}
            onDelete={() => remove.mutate(s.id)}
          />
        )}
      />
      )}
      {!isLoading && !readOnly && (
        <form
          className="space-y-4 rounded-md border border-dashed p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <div className="text-sm font-semibold">Новый шаг</div>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <Field label="Роль" required>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Кто делает" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.code} value={r.code} className="text-sm">{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Действие" required>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Например: прикрепить схему"
                className="h-9 text-sm"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Тип действия">
              <Select value={kind} onValueChange={(v) => setKind(v as Step["action_kind"])}>
                <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_KINDS.map((k) => (
                    <SelectItem key={k.v} value={k.v} className="text-sm">{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Срок, дней">
              <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="h-9 w-32 text-sm" />
            </Field>
            <Button type="submit" disabled={add.isPending} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="size-4" />
              Добавить
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function StepRow({
  step,
  roles,
  readOnly,
  onPatch,
  onDelete,
}: {
  step: Step;
  roles: { code: string; name: string }[];
  readOnly: boolean;
  onPatch: (patch: Partial<Omit<Step, "id" | "step_no">>) => void;
  onDelete: () => void;
}) {
  const [action, setAction] = useState(step.action);
  const [days, setDays] = useState(step.duration_days?.toString() ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
          Шаг {step.step_no}
        </span>
        <Select value={step.role_code} onValueChange={(v) => onPatch({ role_code: v })} disabled={readOnly}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.code} value={r.code} className="text-sm">{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {!readOnly &&
          (confirmDelete ? (
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" className="h-9 text-sm" onClick={() => setConfirmDelete(false)}>
                Отмена
              </Button>
              <Button type="button" variant="destructive" className="h-9 text-sm" onClick={onDelete}>
                Удалить
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label="Удалить шаг"
            >
              <Trash2 className="size-4" />
            </Button>
          ))}
      </div>
      <Input
        value={action}
        disabled={readOnly}
        onChange={(e) => setAction(e.target.value)}
        onBlur={() => {
          const t = action.trim();
          if (!t) {
            toast.error("Действие не может быть пустым");
            setAction(step.action);
            return;
          }
          if (t !== step.action) onPatch({ action: t });
        }}
        className="h-9 text-sm"
      />
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={step.action_kind}
          onValueChange={(v) => onPatch({ action_kind: v as Step["action_kind"] })}
          disabled={readOnly}
        >
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_KINDS.map((k) => (
              <SelectItem key={k.v} value={k.v} className="text-sm">{k.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          Срок, дней:
          <Input
            value={days}
            disabled={readOnly}
            inputMode="numeric"
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => {
              const d = toIntOrNull(days);
              if (d === "bad") {
                toast.error("Срок — целое число от 0 или пусто");
                setDays(step.duration_days?.toString() ?? "");
                return;
              }
              if (d !== step.duration_days) onPatch({ duration_days: d });
            }}
            className="h-8 w-24 text-sm"
          />
        </label>
      </div>
    </div>
  );
}
