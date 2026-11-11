import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REORDER_ACTIONS_W } from "@/lib/ui";
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
import { EditSheet, EmptyRow, Field, FormActions } from "../common";
import { DirectoryTableSkeleton } from "../DirectorySkeleton";
import { SortableTableBody, SortableTableRow } from "../SortableTableRows";
import { parseFieldOptions, validateRequestField } from "../rules";
import { FIELD_TYPES, FILLED_BY, useRequestFields, type FieldType, type RequestField } from "./data";

type Draft = {
  label: string;
  field_type: FieldType;
  filled_by: RequestField["filled_by"];
  is_required: boolean;
  is_active: boolean;
  options: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  field_type: "text",
  filled_by: "initiator",
  is_required: false,
  is_active: true,
  options: "",
});

const typeLabel = (v: string) => FIELD_TYPES.find((t) => t.v === v)?.label ?? v;
const filledLabel = (v: string) => FILLED_BY.find((t) => t.v === v)?.label ?? v;

export function RequestTypeFields({ typeId, readOnly }: { typeId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const key = ["dir-request-fields", typeId];
  const { data: fields = [], isLoading } = useRequestFields(typeId);
  const [editing, setEditing] = useState<RequestField | "new" | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["dir-request-fields", "all"] });
  };

  const reorder = useMutation({
    mutationFn: async (ordered: RequestField[]) => {
      qc.setQueryData<RequestField[]>(key, ordered);
      const results = await Promise.all(
        ordered.map((f, i) => supabase.from("request_type_fields").update({ sort: i + 1 }).eq("id", f.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: refresh,
    onError: showError,
  });

  const applyOrder = (orderedIds: string[]) => {
    const map = new Map(fields.map((f) => [f.id, f]));
    const next = orderedIds.map((id) => map.get(id)).filter((f): f is RequestField => !!f);
    if (next.length !== fields.length) return;
    reorder.mutate(next.map((f, i) => ({ ...f, sort: i + 1 })));
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Поля прораба — в форме новой заявки. Поля офис-менеджера — в карточке заявки. Переименование не меняет уже
          созданные заявки.
        </p>
        {!readOnly && (
          <Button
            type="button"
            className="h-9 gap-1.5 px-3 text-sm"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" />
            Добавить поле
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">№</TableHead>
              <TableHead>Подпись</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Кто заполняет</TableHead>
              <TableHead className="w-24 text-center">Обяз.</TableHead>
              <TableHead className="w-24 text-center">Активно</TableHead>
              {!readOnly && <TableHead className={REORDER_ACTIONS_W} />}
            </TableRow>
          </TableHeader>
          <SortableTableBody
            ids={fields.map((f) => f.id)}
            disabled={readOnly || isLoading}
            onReorder={applyOrder}
          >
            {isLoading ? (
              <DirectoryTableSkeleton cols={6} withActions={!readOnly} />
            ) : fields.length === 0 ? (
              <EmptyRow cols={readOnly ? 6 : 7} />
            ) : (
              fields.map((f, i) => (
                <SortableTableRow
                  key={f.id}
                  id={f.id}
                  disabled={readOnly}
                  className={`${readOnly ? "" : "cursor-pointer"} ${f.is_active ? "" : "text-muted-foreground"}`}
                  onClick={() => !readOnly && setEditing(f)}
                >
                  <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{f.label}</TableCell>
                  <TableCell>{typeLabel(f.field_type)}</TableCell>
                  <TableCell>{filledLabel(f.filled_by)}</TableCell>
                  <TableCell className="text-center">{f.is_required ? "Да" : "—"}</TableCell>
                  <TableCell className="text-center">{f.is_active ? "Да" : "Нет"}</TableCell>
                </SortableTableRow>
              ))
            )}
          </SortableTableBody>
        </Table>
      </div>

      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новое поле" : "Поле заявки"}
      >
        {editing !== null && (
          <FieldForm
            key={editing === "new" ? "new" : editing.id}
            typeId={typeId}
            field={editing === "new" ? null : editing}
            nextSort={Math.max(0, ...fields.map((f) => f.sort)) + 1}
            onClose={() => setEditing(null)}
            onSaved={refresh}
          />
        )}
      </EditSheet>
    </div>
  );
}

function FieldForm({
  typeId,
  field,
  nextSort,
  onClose,
  onSaved,
}: {
  typeId: string;
  field: RequestField | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    field
      ? {
          label: field.label,
          field_type: field.field_type,
          filled_by: field.filled_by,
          is_required: field.is_required,
          is_active: field.is_active,
          options: field.options.join("\n"),
        }
      : emptyDraft(),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const err = validateRequestField({
        label: draft.label,
        field_type: draft.field_type,
        optionsText: draft.options,
      });
      if (err) throw new Error(err);
      const label = draft.label.trim();
      const opts = parseFieldOptions(draft.options);
      const payload = {
        label,
        field_type: draft.field_type,
        filled_by: draft.filled_by,
        is_required: draft.is_required,
        is_active: draft.is_active,
        options: draft.field_type === "select" ? opts : [],
      };
      if (field) {
        const { error } = await supabase.from("request_type_fields").update(payload).eq("id", field.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("request_type_fields").insert({
          ...payload,
          request_type_id: typeId,
          sort: nextSort,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      onSaved();
      onClose();
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!field) return;
      const { error } = await supabase
        .from("request_type_fields")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", field.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Поле удалено");
      onSaved();
      onClose();
    },
    onError: showError,
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Подпись" required>
        <Input
          value={draft.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="Например: Пикеты"
          className="h-10 text-sm"
          autoFocus
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Тип">
          <Select value={draft.field_type} onValueChange={(v) => set("field_type", v as FieldType)}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.v} value={t.v} className="text-sm">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Кто заполняет">
          <Select
            value={draft.filled_by}
            onValueChange={(v) => set("filled_by", v as RequestField["filled_by"])}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILLED_BY.map((t) => (
                <SelectItem key={t.v} value={t.v} className="text-sm">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {draft.field_type === "select" && (
        <Field label="Варианты — по одному в строке" required>
          <Textarea
            value={draft.options}
            onChange={(e) => set("options", e.target.value)}
            rows={4}
            className="text-sm"
          />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
          <Switch checked={draft.is_required} onCheckedChange={(v) => set("is_required", v)} />
          Обязательное
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
          <Switch checked={draft.is_active} onCheckedChange={(v) => set("is_active", v)} />
          Активно
        </label>
      </div>

      <FormActions
        pending={save.isPending}
        onCancel={onClose}
        danger={
          field ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={() => setConfirmDelete(true)}
              title="Удалить"
              aria-label="Удалить"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить поле?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              «{field?.label}» исчезнет из вида заявки. В уже созданных заявках значения останутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-sm">Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 bg-destructive text-sm text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
