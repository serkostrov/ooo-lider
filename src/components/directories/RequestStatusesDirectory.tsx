import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ToneBadge } from "@/components/ToneBadge";
import { REQUEST_STATUSES_KEY, useRequestStatuses, type RequestStatusDef } from "@/components/requests/data";
import { ColorField, ColorSwatch, EditSheet, Field, FormActions, isHexColor } from "./common";
import { StatusDirectoryShell } from "./status-directory-shared";

/**
 * Справочник «Статусы заявок» — шаги хода заявки.
 * Коды фиксированы; название, кнопка, цвет и порядок (sort) настраиваются.
 */
export function RequestStatusesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const statuses = useRequestStatuses();
  const [editing, setEditing] = useState<{ s: RequestStatusDef; i: number } | null>(null);

  const reorder = useMutation({
    mutationFn: async (ordered: RequestStatusDef[]) => {
      const results = await Promise.all(
        ordered.map((s, i) => supabase.from("request_statuses").update({ sort: i + 1 }).eq("code", s.v)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: REQUEST_STATUSES_KEY }),
    onError: showError,
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= statuses.length) return;
    const next = [...statuses];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder.mutate(next.map((s, i) => ({ ...s, sort: i + 1 })));
  };

  return (
    <>
      <StatusDirectoryShell
        title="Статусы заявок"
        hint="Шаги «Хода заявки». Можно поменять название, текст кнопки, цвет и порядок. Коды шагов фиксированы."
        showActions={is_admin}
      >
        {statuses.map((s, i) => (
          <TableRow
            key={s.v}
            className={is_admin ? "cursor-pointer" : ""}
            onClick={() => is_admin && setEditing({ s, i })}
          >
            <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
            <TableCell>
              <ToneBadge color={s.color}>{s.label}</ToneBadge>
            </TableCell>
            <TableCell className="max-w-[18rem] truncate text-muted-foreground">
              {i === 0 ? "создаётся сразу" : `кнопка «${s.next}»`}
            </TableCell>
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
                    disabled={i >= statuses.length - 1 || reorder.isPending}
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
        ))}
      </StatusDirectoryShell>

      <EditSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Статус заявки · шаг ${editing.i + 1}` : "Статус заявки"}
      >
        {editing && (
          <StatusForm key={editing.s.v} s={editing.s} first={editing.i === 0} onClose={() => setEditing(null)} />
        )}
      </EditSheet>
    </>
  );
}

function StatusForm({ s, first, onClose }: { s: RequestStatusDef; first: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(s.label);
  const [action, setAction] = useState(s.next);
  const [color, setColor] = useState(s.color);
  const valid = isHexColor(color);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("request_statuses")
        .update({ name: name.trim(), action_label: first ? "" : action.trim(), color })
        .eq("code", s.v)
        .select("code");
      if (error) throw error;
      if (!data?.length) throw new Error("Справочник статусов заявки не найден в базе — выполните db/10_request_statuses.sql");
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: REQUEST_STATUSES_KEY });
      onClose();
    },
    onError: showError,
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          toast.error("Заполните название");
          return;
        }
        if (!first && !action.trim()) {
          toast.error("Заполните текст кнопки");
          return;
        }
        if (!valid) {
          toast.error("Цвет должен быть в формате #RRGGBB");
          return;
        }
        save.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" autoFocus />
      </Field>
      {!first && (
        <Field label="Текст кнопки перехода на этот шаг" required>
          <Input value={action} onChange={(e) => setAction(e.target.value)} className="h-10 text-sm" />
        </Field>
      )}
      <Field label="Цвет">
        <ColorField value={color} onChange={setColor} />
      </Field>
      <Field label="Пример">
        <div className="flex h-10 flex-wrap items-center gap-3">
          <ToneBadge color={valid ? color : s.color}>{name || s.label}</ToneBadge>
          {!first && (
            <Button type="button" className="pointer-events-none h-9 px-4 text-sm">
              {action || s.next}
            </Button>
          )}
        </div>
      </Field>
      <FormActions pending={save.isPending} onCancel={onClose} />
    </form>
  );
}
