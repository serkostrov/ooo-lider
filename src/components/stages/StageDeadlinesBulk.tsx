import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/DateField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/directories/common";
import { useRefreshStages } from "@/components/stages/data";
import { cn } from "@/lib/utils";

/** Массовый сдвиг сроков и проставление пустых — только admin. */
export function StageDeadlinesBulk({
  objectId,
  compact = false,
}: {
  objectId: string;
  /** На мобилке — только иконка. */
  compact?: boolean;
}) {
  const refresh = useRefreshStages();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState("7");
  const [fillEmpty, setFillEmpty] = useState("");

  const run = useMutation({
    mutationFn: async () => {
      const days = shift.trim() === "" ? null : Number(shift);
      if (days != null && !Number.isFinite(days)) throw new Error("Сдвиг — целое число дней");
      if ((days == null || days === 0) && !fillEmpty) {
        throw new Error("Укажите сдвиг и/или дату для пустых сроков");
      }
      const { data, error } = await supabase.rpc("object_stages_bulk_deadlines", {
        p_object_id: objectId,
        p_shift_days: days && days !== 0 ? Math.trunc(days) : null,
        p_fill_empty: fillEmpty || null,
        p_stage_ids: null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`Обновлено этапов: ${n}`);
      setOpen(false);
      refresh(objectId);
    },
    onError: showError,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          title="Массовые сроки"
          aria-label="Массовые сроки"
          className={cn(
            "h-8 gap-1.5 text-sm",
            compact ? "w-8 shrink-0 px-0 sm:w-auto sm:px-2.5" : "px-2.5",
          )}
        >
          <CalendarRange className="size-3.5 shrink-0" />
          {compact ? <span className="hidden sm:inline">Сроки</span> : "Сроки"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Массовые сроки</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Только незакрытые этапы объекта. Сдвиг двигает срок (и дату начала, если есть). Пустые —
          проставляет выбранную дату.
        </p>
        <Field label="Сдвинуть на, дн. (можно −7)">
          <Input
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            inputMode="numeric"
            className="h-9 text-sm tabular-nums"
            placeholder="7"
          />
        </Field>
        <Field label="Проставить пустым срокам дату">
          <DateField value={fillEmpty} onChange={setFillEmpty} />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            className="h-9"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Применение…" : "Применить"}
          </Button>
          <Button type="button" variant="outline" className="h-9" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
