import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Siren } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OBJECTS_KEY, type ObjectRow } from "./data";
import { cn } from "@/lib/utils";

/** Компактный индикатор нештатки (список / шапка). */
export function ObjectEmergencyIcon({ className }: { className?: string }) {
  return (
    <span
      title="Нештатная ситуация"
      aria-label="Нештатная ситуация"
      className={cn("inline-flex shrink-0 text-danger", className)}
    >
      <Siren className="size-4" />
    </span>
  );
}

/** Баннер нештатной ситуации на карточке объекта. */
export function ObjectEmergencyBanner({ o }: { o: ObjectRow }) {
  if (!o.emergency) return null;
  return (
    <div
      role="status"
      className="flex gap-3 rounded-md border border-danger/40 bg-danger-soft/40 px-3 py-2.5 text-sm text-danger"
    >
      <Siren className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <div className="font-semibold">Нештатная ситуация</div>
        {o.emergency_note ? (
          <p className="whitespace-pre-wrap text-danger/90">{o.emergency_note}</p>
        ) : null}
        {o.emergency_at ? (
          <p className="text-xs text-danger/70">{formatDateTime(o.emergency_at)}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Кнопка объявить / снять нештатную ситуацию. */
export function ObjectEmergencyButton({
  objectId,
  active,
  className,
}: {
  objectId: string;
  active: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const mutate = useMutation({
    mutationFn: async (payload: { active: boolean; note?: string }) => {
      const { error } = await supabase.rpc("object_set_emergency", {
        p_object_id: objectId,
        p_active: payload.active,
        p_note: payload.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.active ? "Нештатная ситуация объявлена" : "Нештатная ситуация снята",
      );
      setOpen(false);
      setNote("");
      void qc.invalidateQueries({ queryKey: OBJECTS_KEY });
      void qc.invalidateQueries({ queryKey: [...OBJECTS_KEY, objectId] });
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: showError,
  });

  if (active) {
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setNote("");
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            title="Снять нештатную ситуацию"
            className={cn(
              "h-8 gap-1.5 border-danger/40 px-2.5 text-danger hover:bg-danger-soft/40",
              className,
            )}
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="sm:hidden">Снять</span>
            <span className="hidden sm:inline">Снять нештатную ситуацию</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">Снять нештатную ситуацию</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            По желанию опишите, как исправили — комментарий попадёт в историю.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Как исправлено (необязательно)"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              disabled={mutate.isPending}
              onClick={() =>
                mutate.mutate({
                  active: false,
                  ...(note.trim() ? { note: note.trim() } : {}),
                })
              }
            >
              Снять
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setNote("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          title="Нештатная ситуация"
          className={cn("h-8 gap-1.5 px-2.5 text-warning hover:bg-warning-soft/30", className)}
        >
          <Siren className="size-3.5 shrink-0" />
          <span className="sm:hidden">Нештатка</span>
          <span className="hidden sm:inline">Нештатная ситуация</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">Нештатная ситуация</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Объект будет выделен у всех участников. Кратко опишите, что произошло.
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Что случилось на объекте…"
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button
            disabled={mutate.isPending || !note.trim()}
            onClick={() => mutate.mutate({ active: true, note: note.trim() })}
            className="bg-danger text-danger-foreground hover:bg-danger/90"
          >
            Объявить
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
