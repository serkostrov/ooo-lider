import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { ToneBadge } from "@/components/ToneBadge";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
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

const KEY = ["dir-stage-statuses"] as const;
type St = { code: string; name: string; color: string; sort: number; is_closed: boolean };

/** Системные коды сценария этапа — удалять нельзя. */
const SYSTEM = new Set([
  "not_started",
  "in_work",
  "sent",
  "waiting_visit",
  "on_approval",
  "on_review",
  "closed",
]);

function slugCode(name: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const latin = name
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return latin.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "status";
}

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

  const move = (from: number, to: number) => {
    if (to < 0 || to >= data.length) return;
    const next = [...data];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder.mutate(next.map((s, i) => ({ ...s, sort: i + 1 })));
  };

  return (
    <>
      <StatusDirectoryShell
        title="Статусы этапов"
        hint="Статусы этапов на объектах. Можно добавить свои, поменять название и цвет. Системные статусы удалить нельзя."
        {...(is_admin ? { onAdd: () => setEditing("new") } : {})}
        showActions={is_admin}
      >
        {isLoading ? null : data.length === 0 ? (
          <EmptyRow cols={is_admin ? 5 : 4} />
        ) : (
          data.map((s, i) => (
            <TableRow
              key={s.code}
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
              {is_admin && (
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
                      disabled={i >= data.length - 1 || reorder.isPending}
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
  const canDelete = !!st && !SYSTEM.has(st.code);

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("Заполните название");
      if (!valid) throw new Error("Цвет должен быть в формате #RRGGBB");
      if (st) {
        const { error } = await supabase
          .from("stage_statuses")
          .update({ name: n, color, is_closed: closed })
          .eq("code", st.code);
        if (error) throw error;
      } else {
        let code = slugCode(n);
        const taken = new Set(existing.map((s) => s.code));
        if (taken.has(code)) {
          let i = 2;
          while (taken.has(`${code}_${i}`)) i += 1;
          code = `${code}_${i}`;
        }
        const sort = Math.max(0, ...existing.map((s) => s.sort)) + 1;
        const { error } = await supabase
          .from("stage_statuses")
          .insert({ code, name: n, color, sort, is_closed: closed });
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
