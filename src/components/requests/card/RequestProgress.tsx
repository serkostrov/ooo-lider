import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/lib/profile";
import {
  scenarioRoleForTransition,
  useRequestTypeScenario,
} from "@/components/directories/request-types/data";
import {
  RequestStatusBadge,
  useRequestFlowStatuses,
  useRequestStatuses,
  type RequestRow,
  type RequestStatusDef,
} from "../data";

/** Кто жмёт переход: роль из сценария вида, иначе запасной дефолт. Админ — все. */
function canAdvanceStatus(
  roleCode: string,
  isAdmin: boolean,
  toStatus: string,
  scenarioRole: string | null,
) {
  if (isAdmin) return true;
  if (scenarioRole) return roleCode === scenarioRole;
  if (toStatus === "ready") return roleCode === "foreman" || roleCode === "pto";
  return roleCode === "office";
}

function useStatusFlow(r: RequestRow) {
  const flow = useRequestFlowStatuses();
  const all = useRequestStatuses();
  const onRework = r.status === "rework";
  // В rework степпер показывает ход до «Готова» (ещё не пройдена заново).
  const effective = onRework ? "ready" : r.status;
  const idx = flow.findIndex((s) => s.v === effective);
  const nextFromFlow = idx >= 0 ? flow[idx + 1] : undefined;
  const prevFromFlow = idx > 0 ? flow[idx - 1] : undefined;
  const reworkDef = all.find((s) => s.v === "rework");
  const readyDef = all.find((s) => s.v === "ready") ?? flow.find((s) => s.v === "ready");

  let next: RequestStatusDef | undefined;
  let prev: RequestStatusDef | undefined;
  if (onRework) {
    next = readyDef
      ? { ...readyDef, next: readyDef.next || "Готова к отправке" }
      : undefined;
    prev = undefined;
  } else {
    next = nextFromFlow;
    // С ready нельзя назад в new — только «На доработку»
    prev = prevFromFlow && prevFromFlow.v !== "new" ? prevFromFlow : undefined;
  }

  return {
    flow,
    idx: onRework ? -1 : idx,
    next,
    prev,
    onRework,
    reworkDef,
    canSendToRework: r.status === "ready" || r.status === "sent" || r.status === "accepted",
  };
}

function whenLines(r: RequestRow, v: string, doneByName: string | null): string[] {
  const lines = (...x: (string | null | undefined)[]) => x.filter((y): y is string => !!y);
  if (v === "new") return lines(formatDateTime(r.created_at), r.initiator_name);
  if (v === "ready") return lines(r.office_name && `Обработал: ${r.office_name}`);
  if (v === "sent") return lines(formatDateTime(r.sent_at));
  if (v === "accepted") return lines(formatDateTime(r.accepted_at));
  if (v === "done") return lines(formatDateTime(r.done_at), doneByName);
  return [];
}

/** Ход статусов заявки — компактная полоса (справа от табов). */
export function RequestStatusStepper({
  r,
  doneByName,
  className,
}: {
  r: RequestRow;
  doneByName: string | null;
  className?: string;
}) {
  const { flow, idx, onRework } = useStatusFlow(r);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {onRework && (
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status="rework" />
          <span className="text-xs text-muted-foreground">Ожидает правок прораба</span>
        </div>
      )}
      <ol className="flex min-w-0 flex-wrap gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 sm:flex-nowrap">
        {flow.map((s, i) => {
          const done = !onRework && i <= idx;
          const current = !onRework && i === idx;
          // Финал «Исполнена» — зелёный, не «сигнальный» жёлтый текущего шага.
          const finished = current && r.status === "done";
          const active = current && !finished;
          const meta = whenLines(r, s.v, doneByName);
          return (
            <li key={s.v} className="min-w-0 flex-1">
              <div
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-medium transition-colors sm:px-2 sm:text-xs",
                  (active || finished) && "bg-card text-foreground",
                  done && !current && "text-foreground/80",
                  !done && !current && "text-muted-foreground",
                  onRework && "opacity-70",
                )}
                title={meta.join(" · ") || undefined}
              >
                <span
                  className={cn(
                    "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold tabular-nums",
                    active
                      ? "bg-signal text-[oklch(0.18_0.02_240)]"
                      : done || finished
                        ? "bg-success text-success-foreground"
                        : "bg-muted-foreground/20 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-2" strokeWidth={3} /> : i + 1}
                </span>
                <span className="truncate">{s.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Действия смены статуса для sticky-бара. Результат/протокол — в форме, не здесь. */
export function RequestStatusActions({
  r,
  missingRequired,
  onChanged,
  beforeChange,
  resultText,
  className,
}: {
  r: RequestRow;
  missingRequired: string[];
  onChanged: () => void;
  /** Сохранить черновик полей до смены статуса (иначе «Отправить» теряет несохранённое). */
  beforeChange?: () => Promise<void>;
  /** Черновик результата с формы (пишется в result_text при «Исполнено»). */
  resultText?: string;
  className?: string;
}) {
  const me = useProfile();
  const { next, prev, onRework, canSendToRework, reworkDef } = useStatusFlow(r);
  const { data: scenario = [] } = useRequestTypeScenario(r.request_type_id);
  const scenarioRole = next ? scenarioRoleForTransition(scenario, next.v) : null;
  const [back, setBack] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Обязательные поля шага (сценарий) — блокируют следующий переход.
  const blockedByFields = missingRequired.length > 0 && !!next;
  const canNext = !!next && canAdvanceStatus(me.role_code, me.is_admin, next.v, scenarioRole);
  const canBack =
    !!prev &&
    !onRework &&
    (me.is_admin || me.role_code === "office" || me.role_code === "foreman" || me.role_code === "pto");
  const canRework = canSendToRework && (me.is_admin || me.role_code === "office");

  const m = useMutation({
    mutationFn: async ({ to, comment }: { to: string; comment?: string }) => {
      await beforeChange?.();
      const args: { p_request_id: string; p_status: string; p_comment?: string } = {
        p_request_id: r.id,
        p_status: to,
      };
      if (comment) args.p_comment = comment;
      const { error } = await supabase.rpc("request_set_status", args);
      if (error) throw error;
      return to;
    },
    onSuccess: (to) => {
      toast.success(
        to === "done" ? "Заявка исполнена" : to === "rework" ? "Отправлена на доработку" : "Статус изменён",
      );
      setBack(false);
      setReworkOpen(false);
      setReason("");
      onChanged();
    },
    onError: showError,
  });

  if (r.status === "done") {
    return (
      <div className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <Check className="size-4" /> Исполнена
        </span>
      </div>
    );
  }

  if (!canNext && !canBack && !canRework) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Смену статуса выполняют роли сценария этого вида заявки.
      </p>
    );
  }

  const doneComment = (resultText ?? r.result_text ?? "").trim();

  return (
    <div className={cn("flex flex-nowrap items-center gap-2", className)}>
      {canRework && (
        <Button
          variant="outline"
          onClick={() => {
            setReason("");
            setReworkOpen(true);
          }}
          className="h-9 shrink-0 gap-1.5 text-sm text-warning hover:text-warning"
        >
          <RotateCcw className="size-3.5" />
          {reworkDef?.next || "На доработку"}
        </Button>
      )}
      {canBack && prev && (
        <Button
          variant="ghost"
          onClick={() => {
            setReason("");
            setBack(true);
          }}
          className="h-9 shrink-0 text-sm text-muted-foreground"
        >
          <Undo2 className="size-4" /> Назад («{prev.label}»)
        </Button>
      )}
      {canNext && next && (
        <Button
          onClick={() =>
            m.mutate({
              to: next.v,
              ...(next.v === "done" && doneComment ? { comment: doneComment } : {}),
            })
          }
          disabled={m.isPending || blockedByFields}
          title={blockedByFields ? `Сначала заполните: ${missingRequired.join(", ")}` : undefined}
          className="h-9 shrink-0 bg-success px-4 text-sm text-success-foreground shadow-none hover:bg-success/90"
        >
          {onRework ? "Готова к отправке" : next.next || next.label}
        </Button>
      )}

      <Dialog open={back} onOpenChange={setBack}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Вернуть на шаг «{prev?.label}»</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) {
                toast.error("Укажите причину");
                return;
              }
              if (prev) m.mutate({ to: prev.v, comment: reason.trim() });
            }}
          >
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина — обязательно"
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                Вернуть
              </Button>
              <Button type="button" variant="outline" onClick={() => setBack(false)} className="h-9 flex-1 text-sm">
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reworkOpen} onOpenChange={setReworkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Отправить на доработку</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) {
                toast.error("Укажите, что нужно доработать");
                return;
              }
              m.mutate({ to: "rework", comment: reason.trim() });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Прораб увидит замечание, внесёт правки и снова отправит заявку.
            </p>
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Что исправить — обязательно"
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                На доработку
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReworkOpen(false)}
                className="h-9 flex-1 text-sm"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
