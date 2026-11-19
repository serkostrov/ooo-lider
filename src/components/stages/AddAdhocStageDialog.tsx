import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/directories/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatProfileOption, useActiveProfiles } from "@/components/objects/data";
import { useProfile } from "@/lib/profile";
import { canCreateAdhocStage } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useRefreshStages } from "./data";

const NONE = "__none";

/** Добавить этап не из справочника (этап вне регламента). */
export function AddAdhocStageDialog({
  objectId,
  compact = false,
}: {
  objectId: string;
  /** На мобилке — только иконка. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const refresh = useRefreshStages();
  const me = useProfile();
  const { data: profiles = [] } = useActiveProfiles();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [executorId, setExecutorId] = useState(me.id);

  const create = useMutation({
    mutationFn: async () => {
      if (!canCreateAdhocStage(me)) throw new Error("Нет прав добавлять работу вне регламента");
      const title = name.trim();
      if (!title) throw new Error("Укажите название");
      const { data, error } = await supabase.rpc("add_object_adhoc_stage", {
        p_object_id: objectId,
        p_name: title,
        p_description: description.trim() || null,
        p_executor_id: executorId && executorId !== NONE ? executorId : me.id,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (stageId) => {
      toast.success("Этап вне регламента добавлен");
      setOpen(false);
      setName("");
      setDescription("");
      setExecutorId(me.id);
      refresh(objectId);
      void navigate({
        to: "/objects/$id/stages/$stageId",
        params: { id: objectId, stageId },
      });
    },
    onError: showError,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          title="Этап вне регламента"
          aria-label="Этап вне регламента"
          className={cn(
            "h-8 gap-1.5 text-sm",
            compact ? "w-8 shrink-0 px-0 sm:w-auto sm:px-2.5" : "px-2.5",
          )}
        >
          <Plus className="size-3.5 shrink-0" />
          {compact ? (
            <span className="hidden sm:inline">Вне регламента</span>
          ) : (
            <>
              <span className="sm:hidden">Вне регл.</span>
              <span className="hidden sm:inline">Вне регламента</span>
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">Этап вне регламента</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Этап не из справочника — для внеплановых работ на объекте. После создания откроется карточка.
        </p>
        <div className="space-y-3">
          <Field label="Название">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Что нужно сделать"
              className="h-9"
            />
          </Field>
          <Field label="Описание">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="По желанию"
              className="text-sm"
            />
          </Field>
          <Field label="Исполнитель">
            <Select value={executorId || NONE} onValueChange={(v) => setExecutorId(v === NONE ? "" : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Исполнитель" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не назначен</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatProfileOption(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            disabled={create.isPending || !name.trim()}
            onClick={() => create.mutate()}
          >
            Добавить
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
