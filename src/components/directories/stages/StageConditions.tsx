import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { CONDITION_KINDS, useDocumentsShort } from "./data";

type Cond = {
  id: string;
  title: string;
  kind: "check" | "file" | "field";
  is_required: boolean;
  to_id_folder: boolean;
  document_id: string | null;
  sort: number;
};

const NONE = "__none";
const kindLabel = (v: string) => CONDITION_KINDS.find((k) => k.v === v)?.label ?? v;

export function StageConditions({ templateId, readOnly }: { templateId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const key = ["dir-stage-conditions", templateId];
  const { data: docs = [] } = useDocumentsShort();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_template_conditions")
        .select("id, title, kind, is_required, to_id_folder, document_id, sort")
        .eq("template_id", templateId)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as Cond[];
    },
  });
  const [editing, setEditing] = useState<Cond | "new" | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["dir-stage-condition-counts"] });
  };

  const reorder = useMutation({
    mutationFn: async (ordered: Cond[]) => {
      qc.setQueryData<Cond[]>(key, ordered);
      const results = await Promise.all(
        ordered.map((c, i) => supabase.from("stage_template_conditions").update({ sort: i + 1 }).eq("id", c.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: refresh,
    onError: showError,
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder.mutate(next.map((c, i) => ({ ...c, sort: i + 1 })));
  };

  const docName = (id: string | null) => {
    if (!id) return "—";
    const d = docs.find((x) => x.id === id);
    return d ? `${d.section}: ${d.name}` : "—";
  };

  if (isLoading) return null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Этап нельзя отправить на проверку и закрыть, пока не отмечены все обязательные условия.
        </p>
        {!readOnly && (
          <Button
            type="button"
            className="h-9 gap-1.5 px-3 text-sm"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" />
            Добавить условие
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">№</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Документ</TableHead>
              <TableHead className="w-24 text-center">Обяз.</TableHead>
              <TableHead className="w-24 text-center">В ИД</TableHead>
              {!readOnly && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <EmptyRow cols={readOnly ? 6 : 7} />
            ) : (
              rows.map((c, i) => (
                <TableRow
                  key={c.id}
                  className={readOnly ? "" : "cursor-pointer"}
                  onClick={() => !readOnly && setEditing(c)}
                >
                  <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>{kindLabel(c.kind)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-muted-foreground">{docName(c.document_id)}</TableCell>
                  <TableCell className="text-center">{c.is_required ? "Да" : "—"}</TableCell>
                  <TableCell className="text-center">{c.to_id_folder ? "Да" : "—"}</TableCell>
                  {!readOnly && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={i === 0 || reorder.isPending}
                          onClick={() => move(i, i - 1)}
                          className="size-8 text-muted-foreground"
                          title="Выше"
                          aria-label="Выше"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={i >= rows.length - 1 || reorder.isPending}
                          onClick={() => move(i, i + 1)}
                          className="size-8 text-muted-foreground"
                          title="Ниже"
                          aria-label="Ниже"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новое условие" : "Условие закрытия"}
      >
        {editing !== null && (
          <CondForm
            key={editing === "new" ? "new" : editing.id}
            templateId={templateId}
            cond={editing === "new" ? null : editing}
            docs={docs}
            nextSort={Math.max(0, ...rows.map((r) => r.sort)) + 1}
            onClose={() => setEditing(null)}
            onSaved={refresh}
          />
        )}
      </EditSheet>
    </div>
  );
}

function CondForm({
  templateId,
  cond,
  docs,
  nextSort,
  onClose,
  onSaved,
}: {
  templateId: string;
  cond: Cond | null;
  docs: { id: string; name: string; section: string }[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(cond?.title ?? "");
  const [kind, setKind] = useState<Cond["kind"]>(cond?.kind ?? "check");
  const [required, setRequired] = useState(cond?.is_required ?? true);
  const [toId, setToId] = useState(cond?.to_id_folder ?? false);
  const [documentId, setDocumentId] = useState(cond?.document_id ?? NONE);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      if (!t) throw new Error("Введите название условия");
      const payload = {
        title: t,
        kind,
        is_required: required,
        to_id_folder: toId,
        document_id: documentId === NONE ? null : documentId,
      };
      if (cond) {
        const { error } = await supabase.from("stage_template_conditions").update(payload).eq("id", cond.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stage_template_conditions").insert({
          ...payload,
          template_id: templateId,
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
      if (!cond) return;
      const { error } = await supabase
        .from("stage_template_conditions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", cond.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Условие удалено");
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
      <Field label="Название" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 text-sm" autoFocus />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Тип">
          <Select value={kind} onValueChange={(v) => setKind(v as Cond["kind"])}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_KINDS.map((k) => (
                <SelectItem key={k.v} value={k.v} className="text-sm">
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Документ из справочника">
          <Select value={documentId} onValueChange={setDocumentId}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-sm">
                Не привязан
              </SelectItem>
              {docs.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-sm">
                  {d.section}: {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
          <Switch checked={required} onCheckedChange={setRequired} />
          Обязательное
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-4 py-3 text-sm">
          <Switch checked={toId} onCheckedChange={setToId} />
          В папку ИД
        </label>
      </div>
      <FormActions
        pending={save.isPending}
        onCancel={onClose}
        danger={
          cond ? (
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
            <AlertDialogTitle className="text-base">Удалить условие?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">«{cond?.title}» будет удалено.</AlertDialogDescription>
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
