import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { canChangeStageStatus, canCloseStage } from "@/lib/permissions";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge, type ObjectStage, type StageCondition } from "../data";

const WORKING = ["in_work", "sent", "waiting_visit", "on_approval"];

function primaryAction(status: string): { to: string; label: string } | null {
  if (status === "not_started") return { to: "in_work", label: "Взять в работу" };
  if (WORKING.includes(status)) return { to: "on_review", label: "Готово — на проверку" };
  return null;
}

/** Нижняя панель на телефоне: текущий этап + крупные действия. */
export function StageMobileDock({
  stage,
  conditions,
  idFolderMissing,
  onChanged,
  onOpenConditions,
}: {
  stage: ObjectStage;
  conditions: StageCondition[];
  idFolderMissing: number;
  onChanged: () => void;
  onOpenConditions: () => void;
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

  if (stage.is_excluded || stage.is_closed) return null;

  const missing = conditions.filter((c) => c.is_required && !c.is_done);
  const idFolderBlocked = !!stage.requires_id_folder_complete && idFolderMissing > 0;
  const canWork = canChangeStageStatus(me, stage);
  const canClose = canCloseStage(me, stage);
  const primary = canWork ? primaryAction(stage.status_code) : null;
  const reviewPrimaryBlocked =
    primary?.to === "on_review" && (missing.length > 0 || idFolderBlocked);
  const pending = setStatus.isPending;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge name={stage.status_name} color={stage.status_color} />
            <Button
              type="button"
              variant="ghost"
              className="ml-auto h-8 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onOpenConditions}
            >
              <ListChecks className="size-3.5" />
              {stage.conditions_done}/{stage.conditions_total}
            </Button>
          </div>

          {primary ? (
            <Button
              type="button"
              disabled={reviewPrimaryBlocked || pending}
              title={
                reviewPrimaryBlocked
                  ? [
                      missing.length > 0
                        ? `Не выполнены: ${missing.map((c) => `«${c.title}»`).join(", ")}`
                        : null,
                      idFolderBlocked ? `Папка ИД неполная: ${idFolderMissing}` : null,
                    ]
                      .filter(Boolean)
                      .join(". ")
                  : undefined
              }
              onClick={() => setStatus.mutate({ to: primary.to })}
              className="h-11 w-full text-sm font-semibold"
            >
              {primary.label}
            </Button>
          ) : null}

          {stage.status_code === "on_review" ? (
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!canClose || pending || idFolderBlocked}
                onClick={() => setStatus.mutate({ to: "closed" })}
                className="h-11 flex-1 bg-success text-sm font-semibold text-success-foreground hover:bg-success/90"
              >
                Принять
              </Button>
              {canClose ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReturning(true)}
                  className="h-11 flex-1 text-sm text-warning"
                >
                  Вернуть
                </Button>
              ) : null}
            </div>
          ) : null}

        </div>
      </div>

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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Причина возврата"
              className="text-sm"
              required
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || !reason.trim()}>
                Вернуть
              </Button>
              <Button type="button" variant="outline" onClick={() => setReturning(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
