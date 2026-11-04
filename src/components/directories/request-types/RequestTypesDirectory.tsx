import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { thLabelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Reorderable } from "../stages/Reorderable";
import { REQUEST_TYPES_KEY, useRequestFields, useRequestTypes, type RequestType } from "./data";

export function RequestTypesDirectory() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useRequestTypes();
  const { data: fields = [] } = useRequestFields();

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      qc.setQueryData<RequestType[]>(REQUEST_TYPES_KEY, (old) =>
        ids.map((id, i) => ({ ...(old ?? []).find((t) => t.id === id)!, sort: i + 1 })),
      );
      const results = await Promise.all(
        ids.map((id, i) => supabase.from("request_types").update({ sort: i + 1 }).eq("id", id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: REQUEST_TYPES_KEY }),
    onError: showError,
  });

  const open = (id: string) => navigate({ to: "/directories/request-types/$id", params: { id } });
  const countFields = (id: string) => fields.filter((f) => f.request_type_id === id && f.is_active).length;

  if (isLoading) return null;

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Виды заявок</h2>
        {is_admin && (
          <Button onClick={() => open("new")} size="icon" title="Добавить" aria-label="Добавить">
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {types.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Видов заявок пока нет
        </p>
      ) : (
        <Reorderable
          items={types}
          disabled={!is_admin}
          onMove={(ids) => reorder.mutate(ids)}
          header={
            <>
              <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
              <div className={`${thLabelClass} w-16 shrink-0 text-right`}>Полей</div>
              <div className={`${thLabelClass} w-52 shrink-0`}>Отправка</div>
              <div className="size-4 shrink-0" aria-hidden />
            </>
          }
          render={(t) => (
            <button
              type="button"
              onClick={() => open(t.id)}
              className={cn(
                "flex w-full items-center gap-3 p-0 text-left",
                !t.is_active && "text-muted-foreground",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {t.name}
                  {!t.is_active && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">
                      неактивен
                    </span>
                  )}
                </div>
                {t.uses_representatives && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">Выбор из представителей</div>
                )}
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {countFields(t.id)}
              </span>
              <span className="w-52 shrink-0 truncate text-xs text-muted-foreground">
                {t.send_to_email || "не указан"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        />
      )}
    </div>
  );
}
