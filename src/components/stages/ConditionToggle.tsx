import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StageCondition } from "./data";

/**
 * Галочка условия закрытия → stage_condition_set().
 * Тип «поле» спрашивает значение; тип «файл» без файла БД отклонит с понятным текстом.
 */
export function ConditionToggle({
  cond,
  disabled,
  onDone,
  size = "md",
}: {
  cond: StageCondition;
  disabled?: boolean;
  onDone: () => void;
  size?: "sm" | "md";
}) {
  const [ask, setAsk] = useState(false);
  const [value, setValue] = useState(cond.value_text ?? "");

  const m = useMutation({
    mutationFn: async ({ done, v }: { done: boolean; v?: string }) => {
      const args: { p_condition_id: string; p_done: boolean; p_value?: string } = {
        p_condition_id: cond.id,
        p_done: done,
      };
      if (v !== undefined) args.p_value = v;
      const { error } = await supabase.rpc("stage_condition_set", args);
      if (error) throw error;
    },
    onSuccess: () => {
      setAsk(false);
      onDone();
    },
    onError: showError,
  });

  const box = size === "sm" ? "size-3.5" : "size-4";

  return (
    <>
      <Checkbox
        className={box}
        checked={cond.is_done}
        disabled={disabled || m.isPending}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={(c) => {
          const done = c === true;
          if (done && cond.kind === "field") {
            setValue(cond.value_text ?? "");
            setAsk(true);
            return;
          }
          m.mutate({ done });
        }}
        aria-label={cond.title}
      />
      <Dialog open={ask} onOpenChange={setAsk}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-base">{cond.title}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate({ done: true, v: value.trim() });
            }}
          >
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Значение"
              className="h-9 text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                Отметить выполненным
              </Button>
              <Button type="button" variant="outline" onClick={() => setAsk(false)} className="h-9 flex-1 text-sm">
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
