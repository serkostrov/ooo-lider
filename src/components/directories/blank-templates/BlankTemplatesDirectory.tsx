import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { thLabelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatLabel } from "../blank-constructor/types";
import { DirectoryListSkeleton } from "../DirectorySkeleton";
import { Reorderable } from "../stages/Reorderable";
import { ReorderModeButton } from "../ReorderModeButton";
import {
  BLANK_TEMPLATES_KEY,
  type BlankTemplate,
  useBlankTemplateUsages,
  useBlankTemplates,
} from "./data";

export function BlankTemplatesDirectory() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useBlankTemplates();
  const { data: usages } = useBlankTemplateUsages();
  const [reordering, setReordering] = useState(false);

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      qc.setQueryData<BlankTemplate[]>(BLANK_TEMPLATES_KEY, (old) =>
        ids.map((id, i) => ({ ...(old ?? []).find((t) => t.id === id)!, sort: i + 1 })),
      );
      const results = await Promise.all(
        ids.map((id, i) =>
          supabase.from("request_blank_templates").update({ sort: i + 1 }).eq("id", id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BLANK_TEMPLATES_KEY }),
    onError: showError,
  });

  const open = (id: string) =>
    navigate({ to: "/directories/blank-templates/$id", params: { id } });

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Шаблоны бланков</h2>
        {is_admin && (
          <div className="flex shrink-0 items-center gap-2">
            <ReorderModeButton active={reordering} onChange={setReordering} />
            <Button onClick={() => open("new")} className="h-9 gap-1.5 px-3 text-sm">
              <Plus className="size-4" />
              Добавить
            </Button>
          </div>
        )}
      </div>
      {isLoading ? (
        <DirectoryListSkeleton
          withActions={is_admin && reordering}
          header={
            <>
              <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
              <div className={`${thLabelClass} w-36 shrink-0`}>Формат</div>
              <div className={`${thLabelClass} min-w-0 flex-[1.2]`}>Используется</div>
            </>
          }
        />
      ) : templates.length === 0 ? (
        <p className="rounded-md border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Шаблонов пока нет — добавьте первый в конструкторе
        </p>
      ) : (
        <Reorderable
          items={templates}
          disabled={!is_admin || !reordering}
          onMove={(ids) => reorder.mutate(ids)}
          onRowClick={(t) => open(t.id)}
          header={
            <>
              <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
              <div className={`${thLabelClass} w-36 shrink-0`}>Формат</div>
              <div className={`${thLabelClass} min-w-0 flex-[1.2]`}>Используется</div>
            </>
          }
          render={(t) => {
            const used = usages?.get(t.id) ?? [];
            return (
              <>
                <div
                  className={cn(
                    "min-w-0 flex-1",
                    (t.is_draft || !t.is_active) && "text-muted-foreground",
                  )}
                >
                  <div className="truncate text-sm font-medium">
                    {t.name}
                    {t.is_draft ? (
                      <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 align-middle text-[11px] font-normal text-warning">
                        черновик
                      </span>
                    ) : !t.is_active ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-normal text-muted-foreground">
                        неактивен
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">
                  {formatLabel(t.format)}
                </span>
                <div className="min-w-0 flex-[1.2] truncate text-xs text-muted-foreground">
                  {used.length === 0 ? (
                    "нигде"
                  ) : (
                    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5">
                      {used.map((u, i) => (
                        <span key={u.id}>
                          <Link
                            to="/directories/request-types/$id"
                            params={{ id: u.id }}
                            className={cn(
                              "text-primary hover:underline",
                              !u.is_active && "text-muted-foreground",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {u.name}
                          </Link>
                          {i < used.length - 1 ? "," : null}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </>
            );
          }}
        />
      )}
    </div>
  );
}
