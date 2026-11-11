import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, showError } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/directories/common";
import { RequestStatusBadge, overdueDays, stageCallLabel, useRequests, type RequestRow } from "../data";
import { useObjectStages } from "@/components/stages/data";

/** Шапка карточки заявки: кто/что слева, срок вызова справа. */
export function RequestHeader({
  r,
  onChanged,
}: {
  r: RequestRow;
  onChanged: () => void;
}) {
  const { data: objectRequests = [] } = useRequests(r.object_id);
  const { data: stages = [] } = useObjectStages(r.object_id);
  const stageNumberById = Object.fromEntries(stages.map((s) => [s.id, s.number]));
  const stageNo = stageCallLabel(r, objectRequests, stageNumberById);

  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold leading-snug tracking-tight">
            <span className="font-medium text-muted-foreground" title={stageNo ? `Сквозной №${r.number}` : undefined}>
              №{stageNo ?? r.number}
            </span>{" "}
            {r.type_name}
          </h1>
          {r.is_new ? (
            <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-semibold text-danger-foreground">
              Новая
            </span>
          ) : (
            <RequestStatusBadge status={r.status} />
          )}
        </div>

        <Link
          to="/objects/$id"
          params={{ id: r.object_id }}
          className="block text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          {r.object_name}
        </Link>
        {r.representative_name && (
          <p className="text-sm text-muted-foreground">Вызываем: {r.representative_name}</p>
        )}
        {r.stage_id && <StageLink objectId={r.object_id} stageId={r.stage_id} />}
      </div>

      <CallDateCard r={r} onChanged={onChanged} />
    </header>
  );
}

function CallDateCard({ r, onChanged }: { r: RequestRow; onChanged: () => void }) {
  const overdue = r.is_overdue && r.status !== "done";
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center gap-3 rounded-md border px-3.5 py-2.5 lg:min-h-full lg:w-auto lg:self-stretch",
        overdue ? "border-danger/45 bg-danger-soft" : "border-border bg-card",
      )}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Дата вызова
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "text-base font-semibold tabular-nums tracking-tight",
              overdue ? "text-danger" : "text-foreground",
            )}
          >
            {formatDate(r.call_date)}
          </span>
          {overdue && (
            <span className="text-xs font-semibold text-danger">
              Не исполнена · {overdueDays(r)} дн.
            </span>
          )}
        </div>
      </div>
      {r.status !== "done" && (
        <MoveDate requestId={r.id} current={r.call_date} onDone={onChanged} />
      )}
    </div>
  );
}

function StageLink({ objectId, stageId }: { objectId: string; stageId: string }) {
  const { data } = useQuery({
    queryKey: ["stage-short", stageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_stages")
        .select("number, name")
        .eq("id", stageId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (!data) return null;
  return (
    <p className="text-muted-foreground">
      Этап:{" "}
      <Link
        to="/objects/$id/stages/$stageId"
        params={{ id: objectId, stageId }}
        className="text-foreground transition-colors hover:text-primary"
      >
        {data.number}. {data.name}
      </Link>
    </p>
  );
}

function MoveDate({
  requestId,
  current,
  onDone,
}: {
  requestId: string;
  current: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Укажите новую дату");
      if (date === current) throw new Error("Дата не изменилась");
      if (!reason.trim()) throw new Error("Укажите причину переноса");
      const { error } = await supabase.rpc("request_set_call_date", {
        p_request_id: requestId,
        p_call_date: date,
        p_comment: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Дата вызова перенесена");
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: showError,
  });

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setDate(current);
          setOpen(true);
        }}
        className="h-8 shrink-0 px-2.5 text-xs"
      >
        <CalendarClock className="size-3.5" />
        Перенести
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Перенести дату вызова</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <Field label="Новая дата" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Причина" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="text-sm" />
            </Field>
            <div className="flex gap-3">
              <Button type="submit" disabled={m.isPending} className="h-9 flex-1 text-sm">
                Перенести
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9 flex-1 text-sm">
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
