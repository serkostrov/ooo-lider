import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type ObjectStage, type StageCondition } from "../data";

type Action = { to: string; label: string; primary?: boolean };

const WORKING = ["in_work", "sent", "waiting_visit", "on_approval"];

/** Какие кнопки показывать при текущем статусе (ТЗ 7.6). */
function actionsFor(status: string): Action[] {
  if (status === "not_started") return [{ to: "in_work", label: "Взять в работу", primary: true }];
  if (WORKING.includes(status)) {
    return [
      { to: "sent", label: "Отправлено" },
      { to: "waiting_visit", label: "Ожидание выезда" },
      { to: "on_approval", label: "На согласовании" },
      { to: "on_review", label: "Готово — на проверку", primary: true },
    ].filter((a) => a.to !== status);
  }
  return [];
}

/** Компактная карточка справа: статус + действия. */
export function StageStatusBar({
  stage,
  conditions,
  onChanged,
}: {
  stage: ObjectStage;
  conditions: StageCondition[];
  onChanged: () => void;
}) {
  const me = useProfile();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");

  const setStatus = useMutation({
    mutationFn: async ({ to, comment }: { to: string; comment?: string }) => {
      if (to === "in_work" && stage.status_code === "not_started" && !stage.executor_id) {
        const { error: assignErr } = await supabase
          .from("object_stages")
          .update({ executor_id: me.id })
          .eq("id", stage.id);
        if (assignErr) throw assignErr;
      }
      const args: { p_stage_id: string; p_status: string; p_comment?: string } = {
        p_stage_id: stage.id,
        p_status: to,
      };
      if (comment) args.p_comment = comment;
      const { error } = await supabase.rpc("stage_set_status", args);
      if (error) throw error;
      return to;
    },
    onSuccess: (to) => {
      toast.success(
        to === "closed"
          ? "Этап закрыт"
          : to === "in_work" && stage.status_code === "on_review"
            ? "Возвращён на доработку"
            : "Статус изменён",
      );
      setReturning(false);
      setReason("");
      onChanged();
    },
    onError: showError,
  });

  if (stage.is_excluded) {
    return (
      <Bar>
        <p className="text-sm text-muted-foreground">Этап исключён из работы на этом объекте.</p>
      </Bar>
    );
  }

  if (stage.status_code === "closed") {
    return (
      <Bar>
        <Head status={<StatusBadge name={stage.status_name} color={stage.status_color} />} />
        <p className="text-sm text-success">Закрыт {stage.closed_at ? formatDateTime(stage.closed_at) : ""}</p>
      </Bar>
    );
  }

  const missing = conditions.filter((c) => c.is_required && !c.is_done);
  const missingText = missing.length
    ? `Не выполнены: ${missing.map((c) => `«${c.title}»`).join(", ")}`
    : "";
  const canClose = me.is_admin || (stage.confirmer_id !== null && stage.confirmer_id === me.id);
  const actions = actionsFor(stage.status_code);
  const primary = actions.filter((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const pending = setStatus.isPending;

  return (
    <>
      <Bar>
        <Head status={<StatusBadge name={stage.status_name} color={stage.status_color} />} />

        <div className="flex flex-col gap-1.5">
          {secondary.length > 0 && (
            <Select key={stage.status_code} onValueChange={(to) => setStatus.mutate({ to })} disabled={pending}>
              <SelectTrigger className="h-8 text-xs text-muted-foreground">
                <SelectValue placeholder="Промежуточный статус" />
              </SelectTrigger>
              <SelectContent>
                {secondary.map((a) => (
                  <SelectItem key={a.to} value={a.to} className="text-sm">
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {primary.map((a) => {
            const blocked = a.to === "on_review" && missing.length > 0;
            return (
              <Button
                key={a.to}
                disabled={blocked || pending}
                title={blocked ? missingText : undefined}
                onClick={() => setStatus.mutate({ to: a.to })}
                className="h-9 w-full text-sm"
              >
                {a.label}
              </Button>
            );
          })}

          {stage.status_code === "on_review" && (
            <>
              <Button
                disabled={!canClose || pending}
                title={canClose ? undefined : "Закрыть этап может только адресат или администратор"}
                onClick={() => setStatus.mutate({ to: "closed" })}
                className="h-9 w-full bg-success text-sm text-success-foreground hover:bg-success/90"
              >
                Принять и закрыть
              </Button>
              <Button
                variant="ghost"
                onClick={() => setReturning(true)}
                className="h-8 w-full text-xs text-warning hover:text-warning"
              >
                Вернуть на доработку
              </Button>
            </>
          )}
        </div>
      </Bar>

      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Вернуть на доработку</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) {
                toast.error("Укажите причину возврата");
                return;
              }
              setStatus.mutate({ to: "in_work", comment: reason.trim() });
            }}
          >
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Что нужно исправить — обязательно"
              rows={4}
              className="text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={pending} className="h-9 flex-1 text-sm">
                Вернуть
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReturning(false)}
                className="h-9 flex-1 text-sm"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Head({ status }: { status: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ход этапа</span>
      {status}
    </div>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
      {children}
    </div>
  );
}
