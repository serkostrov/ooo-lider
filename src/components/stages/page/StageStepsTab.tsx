import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles } from "@/components/directories/stages/data";

export type ObjectStep = {
  id: string;
  step_no: number;
  role_code: string;
  action: string;
  duration_days: number | null;
  state: "pending" | "current" | "done";
  done_at: string | null;
  comment: string | null;
  done_by_profile: { full_name: string } | null;
};

export function useStageSteps(stageId: string) {
  return useQuery({
    queryKey: ["stage-steps", stageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stage_steps")
        .select("id, step_no, role_code, action, duration_days, state, done_at, comment, done_by_profile:profiles!object_stage_steps_done_by_fkey(full_name)")
        .eq("stage_id", stageId)
        .order("step_no");
      if (error) throw error;
      return (data ?? []) as unknown as ObjectStep[];
    },
  });
}

/** Сценарий этапа — «эстафета»: текущий шаг выполнен → передать следующему (ТЗ 7.6). */
export function StageStepsTab({
  steps,
  canAct,
  onChanged,
}: {
  steps: ObjectStep[];
  canAct: (role: string) => boolean;
  onChanged: () => void;
}) {
  const { data: roles = [] } = useRoles();
  const roleName = (code: string) => roles.find((r) => r.code === code)?.name ?? code;
  const [comment, setComment] = useState("");

  const complete = useMutation({
    mutationFn: async (stepId: string) => {
      const args: { p_step_id: string; p_comment?: string } = { p_step_id: stepId };
      if (comment.trim()) args.p_comment = comment.trim();
      const { error } = await supabase.rpc("stage_step_complete", args);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Шаг выполнен — передано дальше");
      setComment("");
      onChanged();
    },
    onError: showError,
  });

  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");

  return (
    <div className="space-y-3">
      {allDone && (
        <p className="rounded-md border border-success/25 bg-success-soft p-4 text-sm text-success">
          Все шаги сценария выполнены.
        </p>
      )}
      <ol className="space-y-3">
        {steps.map((s) => {
          const current = s.state === "current";
          return (
            <li
              key={s.id}
              className={`rounded-md border p-4 ${
                current ? "border-primary bg-accent" : s.state === "done" ? "border-success/20 bg-success-soft/50" : "border-border bg-card"
              }`}
            >
              <div className="flex items-start gap-4">
                {s.state === "done" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                ) : current ? (
                  <CircleDot className="mt-0.5 size-5 shrink-0 text-primary" />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm font-semibold text-muted-foreground">Шаг {s.step_no}</span>
                    <span className="text-sm font-semibold">{roleName(s.role_code)}</span>
                    {s.duration_days !== null && <span className="text-sm text-muted-foreground">срок {s.duration_days} дн.</span>}
                  </div>
                  <div className={`mt-1 text-sm ${s.state === "done" ? "text-muted-foreground" : ""}`}>{s.action}</div>
                  {s.state === "done" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Выполнил {s.done_by_profile?.full_name ?? "сотрудник"}, {formatDateTime(s.done_at)}
                      {s.comment && <div className="mt-0.5 text-foreground/80">Комментарий: {s.comment}</div>}
                    </div>
                  )}
                  {current && canAct(s.role_code) && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Комментарий (необязательно)"
                        className="h-9 min-w-56 flex-1 text-sm"
                      />
                      <Button onClick={() => complete.mutate(s.id)} disabled={complete.isPending} className="h-9 px-4 text-sm">
                        Выполнено — передать дальше
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
