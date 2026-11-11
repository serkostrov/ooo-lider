import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditSheet, EmptyRow, Field, FormActions, Toolbar, matches } from "./common";

const KEY = ["dir-roles"] as const;
type Role = { code: string; name: string; is_admin: boolean; sort: number };

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
  return latin.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "role";
}

/** Справочник ролей (§3.15): можно добавить роль без доработки кода. */
export function RolesDirectory() {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("code, name, is_admin, sort").order("sort");
      if (error) throw error;
      return data as Role[];
    },
  });
  const filtered = data.filter((r) => matches(search, r.name));

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

  const move = (from: number, to: number) => {
    if (to < 0 || to >= data.length) return;
    const next = [...data];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder.mutate(next.map((r, i) => ({ ...r, sort: i + 1 })));
  };

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-muted-foreground">
        Можно править название и признак полного доступа. Системные роли удалить нельзя.
      </p>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Полный доступ</TableHead>
              {is_admin && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : filtered.length === 0 ? (
              <EmptyRow cols={is_admin ? 3 : 2} />
            ) : (
              filtered.map((r) => {
                const idx = data.findIndex((x) => x.code === r.code);
                return (
                  <TableRow
                    key={r.code}
                    className={is_admin ? "cursor-pointer" : ""}
                    onClick={() => is_admin && setEditing(r)}
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.is_admin ? "Да" : "Нет"}</TableCell>
                    {is_admin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx <= 0 || reorder.isPending}
                            onClick={() => move(idx, idx - 1)}
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
                            disabled={idx < 0 || idx >= data.length - 1 || reorder.isPending}
                            onClick={() => move(idx, idx + 1)}
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
                );
              })
            )}
          </TableBody>
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

  const m = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("Укажите название");
      if (role) {
        const { error } = await supabase
          .from("roles")
          .update({ name: n, is_admin: isAdmin })
          .eq("code", role.code);
        if (error) throw error;
      } else {
        let c = slugCode(n);
        const taken = new Set(existing.map((r) => r.code));
        if (taken.has(c)) {
          let i = 2;
          while (taken.has(`${c}_${i}`)) i += 1;
          c = `${c}_${i}`;
        }
        const sortN = Math.max(0, ...existing.map((r) => r.sort)) + 1;
        const { error } = await supabase.from("roles").insert({ code: c, name: n, is_admin: isAdmin, sort: sortN });
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
      <FormActions onCancel={onClose} pending={m.isPending} />
    </form>
  );
}
