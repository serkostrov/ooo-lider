import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
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
import {
  ColorField,
  ColorSwatch,
  EditSheet,
  EmptyRow,
  Field,
  FormActions,
  isHexColor,
} from "./common";
import { StatusDirectoryShell } from "./status-directory-shared";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";
import { SortableTableRow } from "./SortableTableRows";
import { isSystemStageStatus, nextSort, slugCode, uniqueCode, validateStageStatus } from "./rules";

const KEY = ["dir-stage-statuses"] as const;
type St = { code: string; name: string; color: string; sort: number; is_closed: boolean };

export function StatusesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<St | "new" | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_statuses")
        .select("code, name, color, sort, is_closed")
        .order("sort");
      if (error) throw error;
      return data as St[];
    },
  });

  const reorder = useMutation({
    mutationFn: async (ordered: St[]) => {
      qc.setQueryData<St[]>(KEY, ordered);
      const results = await Promise.all(
        ordered.map((s, i) => supabase.from("stage_statuses").update({ sort: i + 1 }).eq("code", s.code)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: showError,
  });

  const applyOrder = (orderedIds: string[]) => {
    const map = new Map(data.map((s) => [s.code, s]));
    const next = orderedIds.map((id) => map.get(id)).filter((s): s is St => !!s);
    if (next.length !== data.length) return;
    reorder.mutate(next.map((s, i) => ({ ...s, sort: i + 1 })));
  };

  return (
    <>
      <StatusDirectoryShell
        title="Статусы этапов"
        hint="Статусы этапов на объектах. Можно добавить свои, поменять название и цвет. Системные статусы удалить нельзя."
        {...(is_admin ? { onAdd: () => setEditing("new") } : {})}
        showActions={is_admin}
        {...(is_admin
          ? { sortable: { ids: data.map((s) => s.code), onReorder: applyOrder } }
          : {})}
      >
        {isLoading ? (
          <DirectoryTableSkeleton cols={4} withActions={is_admin} />
        ) : data.length === 0 ? (
          <EmptyRow cols={is_admin ? 5 : 4} />
        ) : (
          data.map((s, i) => (
            <SortableTableRow
              key={s.code}
              id={s.code}
              disabled={!is_admin}
              className={is_admin ? "cursor-pointer" : ""}
              onClick={() => is_admin && setEditing(s)}
            >
              <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <ToneBadge color={s.color}>{s.name}</ToneBadge>
              </TableCell>
              <TableCell className="truncate text-muted-foreground">{s.is_closed ? "закрывающий" : "—"}</TableCell>
              <TableCell>
                <ColorSwatch color={s.color} />
              </TableCell>
            </SortableTableRow>
          ))
        )}
      </StatusDirectoryShell>

      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый статус" : "Статус этапа"}
      >
        {editing !== null && (
          <StForm
            key={editing === "new" ? "new" : editing.code}
            st={editing === "new" ? null : editing}
            existing={data}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </>
  );
}

function StForm({
  st,
  existing,
  onClose,
}: {
  st: St | null;
  existing: St[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(st?.name ?? "");
  const [color, setColor] = useState(st?.color ?? "#2563EB");
  const [closed, setClosed] = useState(st?.is_closed ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = isHexColor(color);
  const canDelete = !!st && !isSystemStageStatus(st.code);

  const save = useMutation({
    mutationFn: async () => {
      const err = validateStageStatus({ name, color });
      if (err) throw new Error(err);
      const n = name.trim();
      if (st) {
        const { error } = await supabase
          .from("stage_statuses")
          .update({ name: n, color, is_closed: closed })
          .eq("code", st.code);
        if (error) throw error;
      } else {
        const code = uniqueCode(
          slugCode(n, "status"),
          existing.map((s) => s.code),
        );
        const { error } = await supabase
          .from("stage_statuses")
          .insert({ code, name: n, color, sort: nextSort(existing), is_closed: closed });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: showError,
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!st) return;
      const { count, error: e1 } = await supabase
        .from("object_stages")
        .select("id", { count: "exact", head: true })
        .eq("status_code", st.code)
        .is("deleted_at", null);
      if (e1) throw e1;
      if (count) throw new Error(`Статус используется на этапах: ${count}. Сначала смените им статус`);
      const { error } = await supabase.from("stage_statuses").delete().eq("code", st.code);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Удалено");
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => {
      setConfirmDelete(false);
      showError(e);
    },
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
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" autoFocus />
      </Field>
      <Field label="Цвет">
        <ColorField value={color} onChange={setColor} />
      </Field>
      <label className="flex items-start gap-3 rounded-md border border-border/70 bg-background/40 px-4 py-3 text-sm">
        <Switch checked={closed} onCheckedChange={setClosed} className="mt-0.5" />
        <span>
          <span className="font-medium">Закрывающий статус</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Этап с этим статусом считается завершённым</span>
        </span>
      </label>
      <Field label="Пример">
        <div className="flex h-10 items-center">
          <ToneBadge color={valid ? color : st?.color ?? "#2563EB"}>{name || "—"}</ToneBadge>
        </div>
      </Field>
      <FormActions pending={save.isPending} onCancel={onClose} />
      {canDelete && (
        <div className="flex justify-start">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
            title="Удалить"
            aria-label="Удалить"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Удалить статус?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              «{st?.name}» исчезнет из справочника.
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
