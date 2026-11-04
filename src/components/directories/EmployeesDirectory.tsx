import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { DeleteButton, EditSheet, EmptyRow, Field, FormActions, Toolbar, emptyToNull, matches } from "./common";

const KEY = ["dir-profiles"];
type Emp = { id: string; full_name: string; role_code: string; phone: string | null; email: string | null; is_active: boolean; user_id: string | null };
type EmpSort = "name" | "role" | "phone" | "email" | "active" | "login";

export function EmployeesDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Emp | "new" | null>(null);
  const { data: roles = [] } = useQuery({
    queryKey: ["dir-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("code, name").order("sort");
      if (error) throw error;
      return data;
    },
  });
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role_code, phone, email, is_active, user_id")
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      return data as Emp[];
    },
  });
  const roleName = (code: string) => roles.find((r) => r.code === code)?.name ?? code;
  const filtered = data.filter((e) => matches(search, e.full_name, e.phone, e.email, roleName(e.role_code)));
  const { sort, toggle } = useTableSort<EmpSort>();
  const getters = useMemo(
    () =>
      ({
        name: (e: Emp) => e.full_name,
        role: (e: Emp) => roleName(e.role_code),
        phone: (e: Emp) => e.phone,
        email: (e: Emp) => e.email,
        active: (e: Emp) => e.is_active,
        login: (e: Emp) => (e.user_id ? 1 : 0),
      }) satisfies Record<EmpSort, (e: Emp) => unknown>,
    [roles],
  );
  const rows = useSortedRows(filtered, sort, getters);
  return (
    <div>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined} />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle}>ФИО</SortableTh>
              <SortableTh as="table" column="role" sort={sort} onToggle={toggle}>Роль</SortableTh>
              <SortableTh as="table" column="phone" sort={sort} onToggle={toggle}>Телефон</SortableTh>
              <SortableTh as="table" column="email" sort={sort} onToggle={toggle}>Email</SortableTh>
              <SortableTh as="table" column="active" sort={sort} onToggle={toggle}>Активен</SortableTh>
              <SortableTh as="table" column="login" sort={sort} onToggle={toggle}>Логин</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : rows.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              rows.map((e) => (
                <TableRow key={e.id} className={is_admin ? "cursor-pointer" : ""} onClick={() => is_admin && setEditing(e)}>
                  <TableCell className="font-medium">{e.full_name}</TableCell>
                  <TableCell>{roleName(e.role_code)}</TableCell>
                  <TableCell>{e.phone}</TableCell>
                  <TableCell>{e.email}</TableCell>
                  <TableCell>{e.is_active ? "Да" : "Нет"}</TableCell>
                  <TableCell>{e.user_id ? "есть" : "нет"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Новый сотрудник" : "Сотрудник"}>
        {editing !== null && (
          <EmpForm key={editing === "new" ? "new" : editing.id} emp={editing === "new" ? null : editing} roles={roles} onClose={() => setEditing(null)} />
        )}
      </EditSheet>
    </div>
  );
}

function EmpForm({ emp, roles, onClose }: { emp: Emp | null; roles: { code: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(emp?.full_name ?? "");
  const [role, setRole] = useState(emp?.role_code ?? "");
  const [phone, setPhone] = useState(emp?.phone ?? "");
  const [email, setEmail] = useState(emp?.email ?? "");
  const [active, setActive] = useState(emp?.is_active ?? true);
  const m = useMutation({
    mutationFn: async () => {
      const payload = { full_name: name.trim(), role_code: role, phone: emptyToNull(phone), email: emptyToNull(email), is_active: active };
      const { error } = emp
        ? await supabase.from("profiles").update(payload).eq("id", emp.id)
        : await supabase.from("profiles").insert(payload);
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
        if (!name.trim() || !role) { toast.error("Заполните ФИО и роль"); return; }
        m.mutate();
      }}
    >
      <Field label="ФИО" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></Field>
      <Field label="Роль" required>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Выберите роль" /></SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.code} value={r.code} className="text-sm">{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Телефон"><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" /></Field>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" /></Field>
      <label className="flex items-center gap-3 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Активен</label>
      {emp && <p className="text-sm text-muted-foreground">Логин: {emp.user_id ? "есть" : "нет"}</p>}
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          emp ? (
            <DeleteButton table="profiles" id={emp.id} name={emp.full_name} invalidate={KEY} onDone={onClose} />
          ) : undefined
        }
      />
    </form>
  );
}
