import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Field, emptyToNull } from "../common";
import { BlankConstructorEditor } from "../blank-constructor/BlankConstructor";
import {
  BLANK_ENGINES,
  type BlankConfig,
  type BlankEngine,
  type BlankFormat,
  defaultConfig,
  defaultEngineForFormat,
  formatLabel,
} from "../blank-constructor/types";
import { presetConfigForEngine } from "../blank-constructor/enginePresets";
import {
  BLANK_TEMPLATES_KEY,
  type BlankTemplate,
  type BlankTemplateUsage,
  useBlankTemplates,
} from "./data";

function resolveEngine(
  format: BlankFormat | null,
  previous: BlankEngine | null,
): BlankEngine | null {
  if (!format) return null;
  if (
    previous &&
    BLANK_ENGINES.some((e) => e.v === previous && e.format === format)
  ) {
    return previous;
  }
  return defaultEngineForFormat(format);
}

export function BlankTemplateForm({
  template,
  usages = [],
  readOnly,
  onCreated,
  onDeleted,
}: {
  template: BlankTemplate | null;
  usages?: BlankTemplateUsage[];
  readOnly: boolean;
  onCreated: (id: string) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const { data: all = [] } = useBlankTemplates();
  const [name, setName] = useState(template?.name ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);
  const [isDraft, setIsDraft] = useState(template?.is_draft ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [config, setConfig] = useState<BlankConfig>(
    () =>
      template?.config ??
      (template?.engine
        ? presetConfigForEngine(template.engine)
        : defaultConfig()),
  );
  const [blankSavedRevision, setBlankSavedRevision] = useState(0);

  const save = useMutation({
    mutationFn: async (asDraft: boolean) => {
      const trimmed = name.trim() || (asDraft ? "Черновик без названия" : "");
      if (!trimmed) throw new Error("Укажите название шаблона");
      if (!asDraft && !config.format) {
        throw new Error("Выберите формат бланка перед публикацией");
      }

      const resolvedEngine = resolveEngine(config.format, template?.engine ?? null);

      const payload = {
        name: trimmed,
        format: config.format,
        engine: emptyToNull(resolvedEngine ?? ""),
        config: { ...config, format: config.format },
        is_active: asDraft ? false : active,
        is_draft: asDraft,
        updated_at: new Date().toISOString(),
      };

      if (template) {
        const { error } = await supabase
          .from("request_blank_templates")
          .update(payload as never)
          .eq("id", template.id);
        if (error) throw error;

        if (!asDraft && resolvedEngine) {
          const { error: syncErr } = await supabase
            .from("request_types")
            .update({ doc_template: resolvedEngine } as never)
            .eq("blank_template_id", template.id)
            .is("deleted_at", null);
          if (syncErr) throw syncErr;
        }
        return { id: template.id, asDraft, created: false };
      }

      const sort = all.reduce((mx, t) => Math.max(mx, t.sort), 0) + 10;
      const { data, error } = await supabase
        .from("request_blank_templates")
        .insert({ ...payload, sort } as never)
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string, asDraft, created: true };
    },
    onSuccess: async ({ id, asDraft, created }) => {
      setIsDraft(asDraft);
      if (asDraft) setActive(false);
      setBlankSavedRevision((n) => n + 1);
      toast.success(asDraft ? "Черновик сохранён" : "Шаблон опубликован");
      await qc.invalidateQueries({ queryKey: BLANK_TEMPLATES_KEY });
      await qc.invalidateQueries({ queryKey: ["dir-request-types"] });
      if (created) onCreated(id);
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("Шаблон ещё не сохранён");
      const { error: unlinkErr } = await supabase
        .from("request_types")
        .update({ blank_template_id: null } as never)
        .eq("blank_template_id", template.id)
        .is("deleted_at", null);
      if (unlinkErr) throw unlinkErr;
      const { error } = await supabase
        .from("request_blank_templates")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Шаблон удалён");
      setConfirmDelete(false);
      await qc.invalidateQueries({ queryKey: BLANK_TEMPLATES_KEY });
      await qc.invalidateQueries({ queryKey: ["dir-request-types"] });
      onDeleted?.();
    },
    onError: showError,
  });

  return (
    <form
      className="w-full space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(false);
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="max-w-md w-full space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {isDraft ? (
              <Badge variant="warning">черновик</Badge>
            ) : (
              <Badge variant="success">опубликован</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Черновик можно доделать позже; в виды заявок — только опубликованные.
            </span>
          </div>

          <Field label="Название" required={!isDraft}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              className="h-9 text-sm"
              placeholder="Например: Лаборатория МГ — факс"
            />
          </Field>

          {config.format && (
            <p className="text-sm text-muted-foreground">
              Тип бланка:{" "}
              <span className="font-medium text-foreground">
                {formatLabel(config.format)}
              </span>
            </p>
          )}
        </div>

        <div className="flex w-full max-w-sm shrink-0 flex-col gap-3 lg:ml-auto">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={active}
              onCheckedChange={setActive}
              disabled={readOnly || isDraft}
            />
            Активен
            {isDraft && (
              <span className="text-xs text-muted-foreground">(после публикации)</span>
            )}
          </label>

          {usages.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Используется в видах заявок
              </p>
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {usages.map((u) => (
                  <Link
                    key={u.id}
                    to="/directories/request-types/$id"
                    params={{ id: u.id }}
                    className="text-primary hover:underline"
                  >
                    {u.name}
                    {!u.is_active ? " (неакт.)" : ""}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Конструктор бланка</h2>
        <BlankConstructorEditor
          config={config}
          onChange={setConfig}
          readOnly={readOnly}
          savedRevision={blankSavedRevision}
        />
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending || remove.isPending}
            className="h-9 w-full text-sm sm:w-auto sm:px-6"
            onClick={() => save.mutate(true)}
          >
            {save.isPending ? "Сохранение…" : "Сохранить черновик"}
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || remove.isPending}
            className="h-9 w-full text-sm sm:w-auto sm:px-8"
          >
            {save.isPending
              ? "Сохранение…"
              : isDraft
                ? "Опубликовать шаблон"
                : "Сохранить шаблон"}
          </Button>
          {template && (
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending || remove.isPending}
              className="h-9 w-full gap-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto sm:w-auto"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
              Удалить
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              «{template?.name}» будет удалён из справочника.
              {usages.length > 0
                ? ` У ${usages.length} ${usages.length === 1 ? "вида заявки" : "видов заявок"} привязка снимется.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
    </form>
  );
}
