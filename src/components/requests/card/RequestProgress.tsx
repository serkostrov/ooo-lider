import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/lib/profile";
import { useRequestStatuses, type RequestRow } from "../data";

/** Кто по умолчанию жмёт переход на статус (как в сценарии вида). Админ — все. */
function canAdvanceStatus(roleCode: string, isAdmin: boolean, toStatus: string) {
  if (isAdmin) return true;
  if (toStatus === "ready") return roleCode === "foreman" || roleCode === "pto";
  return roleCode === "office";
}

function useStatusFlow(r: RequestRow) {
  const statuses = useRequestStatuses();
  const idx = statuses.findIndex((s) => s.v === r.status);
  return {
    statuses,
    idx,
    next: statuses[idx + 1],
    prev: idx > 0 ? statuses[idx - 1] : undefined,
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
  const { statuses, idx } = useStatusFlow(r);
  return (
    <ol
      className={cn(
        "flex min-w-0 flex-wrap gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 sm:flex-nowrap",
        className,
      )}
    >
      {statuses.map((s, i) => {
        const done = i <= idx;
        const current = i === idx;
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
  );
}

/** Действия смены статуса для sticky-бара. */
export function RequestStatusActions({
  r,
  missingRequired,
  onChanged,
  beforeChange,
  className,
}: {
  r: RequestRow;
  missingRequired: string[];
  onChanged: () => void;
  /** Сохранить черновик полей до смены статуса (иначе «Отправить» теряет несохранённое). */
  beforeChange?: () => Promise<void>;
  className?: string;
}) {
  const me = useProfile();
  const { next, prev } = useStatusFlow(r);
  const [result, setResult] = useState(r.result_text ?? "");
  const [back, setBack] = useState(false);
  const [reason, setReason] = useState("");
  // Обязательные поля — до «Готова» и до «Отправлена».
  const blockedByFields =
    missingRequired.length > 0 && (next?.v === "ready" || next?.v === "sent");
  const canNext = !!next && canAdvanceStatus(me.role_code, me.is_admin, next.v);
  const canBack = !!prev && (me.is_admin || me.role_code === "office" || me.role_code === "foreman" || me.role_code === "pto");

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
      toast.success(to === "done" ? "Заявка исполнена" : "Статус изменён");
      setBack(false);
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
        {r.result_text && <span className="text-muted-foreground">Результат: {r.result_text}</span>}
      </div>
    );
  }

  if (!canNext && !canBack) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Смену статуса выполняют роли сценария этого вида заявки.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-nowrap items-center gap-2", className)}>
      {canBack && prev && (
        <Button
          variant="ghost"
          onClick={() => setBack(true)}
          className="h-9 shrink-0 text-sm text-muted-foreground"
        >
          <Undo2 className="size-4" /> Назад («{prev.label}»)
        </Button>
      )}
      {canNext && next?.v === "done" && (
        <Input
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="Результат / номер протокола"
          className="h-9 w-52 shrink-0 text-sm sm:w-64"
        />
      )}
      {canNext && next && (
        <Button
          onClick={() =>
            m.mutate({
              to: next.v,
              ...(next.v === "done" && result.trim() ? { comment: result.trim() } : {}),
            })
          }
          disabled={m.isPending || blockedByFields}
          title={blockedByFields ? `Сначала заполните: ${missingRequired.join(", ")}` : undefined}
          className="h-9 shrink-0 bg-success px-4 text-sm text-success-foreground shadow-none hover:bg-success/90"
        >
          {next.next}
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
    </div>
  );
}
