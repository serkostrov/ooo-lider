import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { DeleteButton, EditSheet, EmptyRow, Field, FormActions, Toolbar, emptyToNull, matches } from "./common";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";

import { DOC_SECTIONS, validateDocument } from "./rules";

export { DOC_SECTIONS };
const NONE = "__none";
const KEY = ["dir-documents"];

type Doc = {
  id: string;
  name: string;
  section: string;
  stage_template_id: string | null;
  to_id_folder: boolean;
  comment: string | null;
};

export function useStageTemplates() {
  return useQuery({
    queryKey: ["dir-stage-templates-short"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_templates")
        .select("id, number, name")
        .is("deleted_at", null)
        .order("number");
      if (error) throw error;
      return data;
    },
  });
}

export function DocumentsDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("all");
  const [editing, setEditing] = useState<Doc | "new" | null>(null);
  const { data: templates = [] } = useStageTemplates();
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, section, stage_template_id, to_id_folder, comment")
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return data as Doc[];
    },
  });
  const tplLabel = (id: string | null) => {
    const t = templates.find((x) => x.id === id);
    return t ? `${t.number}. ${t.name}` : "";
  };
  type DocSort = "name" | "section" | "stage" | "folder" | "comment";
  const filtered = data.filter(
    (d) => (section === "all" || d.section === section) && matches(search, d.name, d.comment, tplLabel(d.stage_template_id)),
  );
  const { sort, toggle } = useTableSort<DocSort>();
  const getters = useMemo(
    () =>
      ({
        name: (d: Doc) => d.name,
        section: (d: Doc) => d.section,
        stage: (d: Doc) => tplLabel(d.stage_template_id),
        folder: (d: Doc) => d.to_id_folder,
        comment: (d: Doc) => d.comment,
      }) satisfies Record<DocSort, (d: Doc) => unknown>,
    [templates],
  );
  const rows = useSortedRows(filtered, sort, getters);

  return (
    <div>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined}>
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger className="h-9 w-full min-w-44 max-w-60 shrink-0 text-sm sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm">Все разделы</SelectItem>
            {DOC_SECTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle}>Название</SortableTh>
              <SortableTh as="table" column="section" sort={sort} onToggle={toggle}>Раздел</SortableTh>
              <SortableTh as="table" column="stage" sort={sort} onToggle={toggle}>Этап</SortableTh>
              <SortableTh as="table" column="folder" sort={sort} onToggle={toggle}>В папку ИД</SortableTh>
              <SortableTh as="table" column="comment" sort={sort} onToggle={toggle}>Комментарий</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DirectoryTableSkeleton cols={5} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={5} />
            ) : (
              rows.map((d) => (
                <TableRow key={d.id} className={is_admin ? "cursor-pointer" : ""} onClick={() => is_admin && setEditing(d)}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.section}</TableCell>
                  <TableCell>{tplLabel(d.stage_template_id)}</TableCell>
                  <TableCell>{d.to_id_folder ? "Да" : "Нет"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.comment}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый документ" : "Документ"}
      >
        {editing !== null && (
          <DocForm key={editing === "new" ? "new" : editing.id} doc={editing === "new" ? null : editing} templates={templates} onClose={() => setEditing(null)} />
        )}
      </EditSheet>
    </div>
  );
}

function DocForm({
  doc,
  templates,
  onClose,
}: {
  doc: Doc | null;
  templates: { id: string; number: number; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(doc?.name ?? "");
  const [section, setSection] = useState(doc?.section ?? "");
  const [tpl, setTpl] = useState(doc?.stage_template_id ?? NONE);
  const [toId, setToId] = useState(doc?.to_id_folder ?? false);
  const [comment, setComment] = useState(doc?.comment ?? "");
  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        section,
        stage_template_id: tpl === NONE ? null : tpl,
        to_id_folder: toId,
        comment: emptyToNull(comment),
      };
      const { error } = doc
        ? await supabase.from("documents").update(payload).eq("id", doc.id)
        : await supabase.from("documents").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: showError,
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const err = validateDocument({ name, section });
        if (err) {
          toast.error(err);
          return;
        }
        m.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
      </Field>
      <Field label="Раздел" required>
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Выберите раздел" /></SelectTrigger>
          <SelectContent>
            {DOC_SECTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Этап">
        <Select value={tpl} onValueChange={setTpl}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-sm">Не выбран</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-sm">{t.number}. {t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={toId} onCheckedChange={setToId} /> В папку ИД
      </label>
      <Field label="Комментарий">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="text-sm" />
      </Field>
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          doc ? (
            <DeleteButton table="documents" id={doc.id} name={doc.name} invalidate={KEY} onDone={onClose} />
          ) : undefined
        }
      />
    </form>
  );
}

