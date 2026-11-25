import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field } from "@/components/directories/common";
import { softDeleteRequest, useRefreshRequests, type RequestRow } from "@/components/requests/data";

export function DeleteRequestButton({
  r,
  backObjectId,
  className,
}: {
  r: RequestRow;
  /** Если открыли с объекта — вернуться туда. */
  backObjectId?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const refreshAll = useRefreshRequests();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const remove = useMutation({
    mutationFn: () => softDeleteRequest(r.id, reason),
    onSuccess: async () => {
      toast.success(`Заявка №${r.number} удалена`);
      setOpen(false);
      refreshAll(r.id);
      if (backObjectId) {
        await navigate({
          to: "/objects/$id",
          params: { id: backObjectId },
          search: { tab: "requests" },
        });
      } else {
        await navigate({ to: "/requests" });
      }
    },
    onError: showError,
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-9 gap-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        Удалить
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (remove.isPending) return;
          setOpen(v);
          if (!v) setReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить заявку №{r.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              «{r.type_name}» исчезнет из списков. Восстановить можно только через базу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field label="Причина (необязательно)">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Например: создана по ошибке"
              disabled={remove.isPending}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? "Удаление…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
