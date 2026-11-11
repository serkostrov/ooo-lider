import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { StageTemplate } from "./data";

export function StagePredecessors({
  templateId,
  allStages,
  readOnly,
}: {
  templateId: string;
  allStages: StageTemplate[];
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const key = ["dir-stage-predecessors", templateId];
  const [open, setOpen] = useState(false);

  const { data: predIds = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_template_predecessors")
        .select("predecessor_id")
        .eq("template_id", templateId);
      if (error) throw error;
      return (data ?? []).map((r) => r.predecessor_id as string);
    },
  });

  const add = useMutation({
    mutationFn: async (predecessorId: string) => {
      const { error } = await supabase
        .from("stage_template_predecessors")
        .insert({ template_id: templateId, predecessor_id: predecessorId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async (predecessorId: string) => {
      const { error } = await supabase
        .from("stage_template_predecessors")
        .delete()
        .eq("template_id", templateId)
        .eq("predecessor_id", predecessorId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: showError,
  });

  const selected = allStages.filter((s) => predIds.includes(s.id)).sort((a, b) => a.number - b.number);
  const available = allStages.filter((s) => s.id !== templateId && !predIds.includes(s.id));

  return (
    <div className="w-full space-y-4">
      <p className="text-sm text-muted-foreground">
        Этап можно взять в работу раньше — он будет отмечен «вне очереди».
      </p>
      {isLoading ? (
        <ul className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5">
              <Skeleton height={16} width={`${40 + i * 15}%`} containerClassName="flex-1" />
            </li>
          ))}
        </ul>
      ) : selected.length === 0 ? (
        <p className="py-2.5 text-sm text-muted-foreground">Предшествующих этапов нет</p>
      ) : (
        <ul className="space-y-2">
          {selected.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm">
              <span className="flex-1">
                <span className="font-semibold">{s.number}.</span> {s.name}
              </span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-destructive"
                  onClick={() => remove.mutate(s.id)}
                  disabled={remove.isPending}
                  aria-label="Убрать"
                >
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="size-4" />
              Добавить этап
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(36rem,calc(100vw-2rem))] p-0" align="start">
            <Command
              filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
            >
              <CommandInput placeholder="Номер или название этапа" className="h-9 text-sm" />
              <CommandList className="max-h-80">
                <CommandEmpty className="py-4 text-center text-sm">Ничего не найдено</CommandEmpty>
                {available.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.number}. ${s.name}`}
                    onSelect={() => {
                      add.mutate(s.id);
                      setOpen(false);
                    }}
                    className="py-2 text-sm"
                  >
                    <span className="font-semibold">{s.number}.</span>&nbsp;{s.name}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
