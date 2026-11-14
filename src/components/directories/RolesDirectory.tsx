import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REORDER_ACTIONS_W } from "@/lib/ui";
import { EditSheet, EmptyRow, Field, FormActions, Toolbar, matches } from "./common";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";
import { SortableTableBody, SortableTableRow } from "./SortableTableRows";
import { ReorderModeButton } from "./ReorderModeButton";
import { nextSort, slugCode, uniqueCode, validateRole } from "./rules";

const KEY = ["dir-roles"] as const;
const ROLES_FOR_MEMBERS_KEY = ["roles-for-members"] as const;

type Role = {
  code: string;
  name: string;
  is_admin: boolean;
  required_on_object_create: boolean;
  sort: number;
};

/** Справочник ролей (§3.15): можно добавить роль без доработки кода. */
export function RolesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [reordering, setReordering] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("code, name, is_admin, required_on_object_create, sort")
        .order("sort");
      if (error) throw error;
      return data as Role[];
    },
  });
  const filtered = data.filter((r) => matches(search, r.name));
  /** При поиске DnD выключаем — иначе ломается порядок полного списка. */
  const canReorder = is_admin && !search.trim();
  const handles = canReorder && reordering;

  const reorder = useMutation({
    mutationFn: async (ordered: Role[]) => {
      qc.setQueryData<Role[]>(KEY, ordered);
      const results = await Promise.all(
        ordered.map((r, i) => supabase.from("roles").update({ sort: i + 1 }).eq("code", r.code)),
      );
      const failed = results.find((x) => x.error);
      if (failed?.error) throw failed.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: showError,
  });

  const applyOrder = (orderedIds: string[]) => {
    const map = new Map(data.map((r) => [r.code, r]));
    const next = orderedIds.map((id) => map.get(id)).filter((r): r is Role => !!r);
    if (next.length !== data.length) return;
    reorder.mutate(next.map((r, i) => ({ ...r, sort: i + 1 })));
  };

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-muted-foreground">
        Можно править название, полный доступ и обязательность при создании объекта. Системные роли удалить нельзя.
        {is_admin && search.trim() ? " Сбросьте поиск, чтобы менять порядок." : null}
      </p>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined}>
        {is_admin ? (
          <ReorderModeButton
            active={reordering}
            onChange={setReordering}
            disabled={!!search.trim() && !reordering}
          />
        ) : null}
      </Toolbar>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Полный доступ</TableHead>
              <TableHead>Обязательна при создании объекта</TableHead>
              {handles && <TableHead className={REORDER_ACTIONS_W} />}
            </TableRow>
          </TableHeader>
          <SortableTableBody
            ids={filtered.map((r) => r.code)}
            disabled={!handles}
            onReorder={applyOrder}
          >
            {isLoading ? (
              <DirectoryTableSkeleton cols={3} withActions={handles} />
            ) : filtered.length === 0 ? (
              <EmptyRow cols={handles ? 4 : 3} />
            ) : (
              filtered.map((r) => (
                <SortableTableRow
                  key={r.code}
                  id={r.code}
                  disabled={!handles}
                  className={is_admin ? "cursor-pointer" : ""}
                  onClick={() => is_admin && setEditing(r)}
                >
                  <TableCell className="font-medium">
                    {r.name}
                    {r.required_on_object_create ? (
                      <span className="ml-1 text-destructive" title="Обязательна при создании объекта">
                        *
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.is_admin ? "Да" : "Нет"}</TableCell>
                  <TableCell>{r.required_on_object_create ? "Да" : "Нет"}</TableCell>
                </SortableTableRow>
              ))
            )}
          </SortableTableBody>
        </Table>
      </div>
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новая роль" : "Роль"}
      >
        {editing !== null && (
          <RoleForm
            key={editing === "new" ? "new" : editing.code}
            role={editing === "new" ? null : editing}
            existing={data}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </div>
  );
}

function RoleForm({
  role,
  existing,
  onClose,
}: {
  role: Role | null;
  existing: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [isAdmin, setIsAdmin] = useState(role?.is_admin ?? false);
  const [requiredOnCreate, setRequiredOnCreate] = useState(role?.required_on_object_create ?? false);

  const m = useMutation({
    mutationFn: async () => {
      const err = validateRole(name);
      if (err) throw new Error(err);
      const n = name.trim();
      if (role) {
        const { error } = await supabase
          .from("roles")
          .update({
            name: n,
            is_admin: isAdmin,
            required_on_object_create: requiredOnCreate,
          })
          .eq("code", role.code);
        if (error) throw error;
      } else {
        const c = uniqueCode(
          slugCode(n, "role"),
          existing.map((r) => r.code),
        );
        const { error } = await supabase.from("roles").insert({
          code: c,
          name: n,
          is_admin: isAdmin,
          required_on_object_create: requiredOnCreate,
          sort: nextSort(existing),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ROLES_FOR_MEMBERS_KEY });
      onClose();
    },
    onError: showError,
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Field label="Название" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" autoFocus />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
        Полный доступ (как администратор / руководитель)
      </label>
      <label className="flex items-start gap-3 text-sm">
        <Switch
          checked={requiredOnCreate}
          onCheckedChange={setRequiredOnCreate}
          className="mt-0.5"
        />
        <span>
          Обязательна при создании объекта
          <span className="mt-0.5 block text-xs text-muted-foreground">
            На шаге «Участники» будет звёздочка; без участника с этой ролью объект не создать
          </span>
        </span>
      </label>
      <FormActions onCancel={onClose} pending={m.isPending} />
    </form>
  );
}
