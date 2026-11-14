import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { ToneBadge } from "@/components/ToneBadge";
import {
  REQUEST_FLOW_STATUSES,
  REQUEST_STATUSES_KEY,
  useRequestStatuses,
  type RequestStatusDef,
} from "@/components/requests/data";
import { ColorField, ColorSwatch, EditSheet, Field, FormActions, isHexColor } from "./common";
import { StatusDirectoryShell } from "./status-directory-shared";
import { SortableTableRow } from "./SortableTableRows";
import { validateRequestStatus } from "./rules";

/**
 * Справочник «Статусы заявок» — шаги хода заявки.
 * Коды и порядок фиксированы. Настраиваются название, кнопка и цвет.
 */
export function RequestStatusesDirectory() {
  const { is_admin } = useProfile();
  const statuses = useRequestStatuses();
  const flow = statuses.filter((s) => REQUEST_FLOW_STATUSES.includes(s.v));
  const side = statuses.filter((s) => !REQUEST_FLOW_STATUSES.includes(s.v));
  const [editing, setEditing] = useState<{ s: RequestStatusDef; i: number; side?: boolean } | null>(null);

  return (
    <>
      <StatusDirectoryShell
        title="Статусы заявок"
        hint="Ход: Новая → Готова к отправке → Отправлена → Принята → Исполнена. «Требует доработки» — боковая ветка: офис возвращает прорабу, тот снова отдаёт в «Готова». Можно поменять название, текст кнопки и цвет."
      >
        {flow.map((s, i) => (
          <SortableTableRow
            key={s.v}
            id={String(s.v)}
            disabled
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
          </SortableTableRow>
        ))}
        {side.map((s) => (
          <SortableTableRow
            key={s.v}
            id={String(s.v)}
            disabled
            className={is_admin ? "cursor-pointer" : ""}
            onClick={() => is_admin && setEditing({ s, i: 0, side: true })}
          >
            <TableCell className="text-muted-foreground">—</TableCell>
            <TableCell>
              <ToneBadge color={s.color}>{s.label}</ToneBadge>
            </TableCell>
            <TableCell className="max-w-[18rem] truncate text-muted-foreground">
              боковая ветка · кнопка «{s.next}»
            </TableCell>
            <TableCell>
              <ColorSwatch color={s.color} />
            </TableCell>
          </SortableTableRow>
        ))}
      </StatusDirectoryShell>

      <EditSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={
          editing
            ? editing.side
              ? `Статус заявки · ${editing.s.label}`
              : `Статус заявки · шаг ${editing.i + 1}`
            : "Статус заявки"
        }
      >
        {editing && (
          <StatusForm
            key={editing.s.v}
            s={editing.s}
            first={!editing.side && editing.i === 0}
            onClose={() => setEditing(null)}
          />
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
        const err = validateRequestStatus({ name, action, color, first });
        if (err) {
          toast.error(err);
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
