import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircleQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTIFICATIONS_KEY } from "@/components/notifications/data";
import { stageMessagesKey } from "@/components/stages/page/StageMessagesTab";

/** Запросить статус у исполнителя этапа (сообщение с @тегом + уведомление). */
export function RequestStatusButton({
  stageId,
  className,
  compact,
  onAsked,
}: {
  stageId: string;
  className?: string;
  compact?: boolean;
  /** После успеха — например открыть вкладку «Сообщения». */
  onAsked?: () => void;
}) {
  const qc = useQueryClient();
  const ask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_stage_status", {
        p_stage_id: stageId,
        p_note: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Запрос статуса отправлен исполнителю");
      void qc.invalidateQueries({ queryKey: stageMessagesKey(stageId) });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void qc.invalidateQueries({ queryKey: ["history"] });
      onAsked?.();
    },
    onError: showError,
  });

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon" : "sm"}
      className={cn(compact ? "size-8" : "h-8 gap-1.5 text-sm", className)}
      disabled={ask.isPending}
      title="Запросить статус"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ask.mutate();
      }}
    >
      <MessageCircleQuestion className="size-3.5" />
      {compact ? null : ask.isPending ? "…" : "Запросить статус"}
    </Button>
  );
}
