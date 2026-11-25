import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { normalizePhone } from "@/lib/validation";
import { issueAccess, resetPassword, type AccessResult } from "@/lib/admin-user-access";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SortableTh } from "@/components/SortableTh";
import { DeleteButton, EditSheet, EmptyRow, Field, FormActions, Toolbar, emptyToNull, matches } from "./common";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";
import { validateEmployee } from "./rules";

const KEY = ["dir-profiles"];
const RESET_KEY = ["password-reset-pending"];

type Emp = {
  id: string;
  full_name: string;
  role_code: string;
  role_codes: string[];
  phone: string | null;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
};
type EmpSort = "name" | "role" | "phone" | "email" | "active" | "login";

type PendingReset = {
  id: string;
  profile_id: string;
  email: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

function formatRequestWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EmployeesDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Emp | "new" | null>(null);
  const [issued, setIssued] = useState<AccessResult | null>(null);
  const [showIssuedPassword, setShowIssuedPassword] = useState(false);

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
      const ids = (data ?? []).map((r) => r.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pr, error: prErr } = ids.length
        ? await (supabase as any).from("profile_roles").select("profile_id, role_code").in("profile_id", ids)
        : { data: [], error: null };
      if (prErr) throw prErr;
      const byId = new Map<string, string[]>();
      for (const row of (pr ?? []) as { profile_id: string; role_code: string }[]) {
        const list = byId.get(row.profile_id) ?? [];
        list.push(row.role_code);
        byId.set(row.profile_id, list);
      }
      return (data ?? []).map((e) => {
        const extra = byId.get(e.id) ?? [];
        const role_codes = [...new Set([...extra, e.role_code].filter(Boolean))];
        return { ...e, role_codes } as Emp;
      });
    },
  });

  const { data: pendingResets = [] } = useQuery({
    queryKey: RESET_KEY,
    enabled: is_admin,
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // Явный FK: иначе PostgREST путает profile_id и resolved_by → оба ссылаются на profiles
      const { data, error } = await (supabase as any)
        .from("password_reset_requests")
        .select("id, profile_id, email, created_at, profiles!password_reset_requests_profile_id_fkey(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingReset[];
    },
  });

  const roleName = (code: string) => roles.find((r) => r.code === code)?.name ?? code;
  const roleNames = (e: Emp) =>
    (e.role_codes.length ? e.role_codes : [e.role_code]).map(roleName).join(", ");
  const filtered = data.filter((e) => matches(search, e.full_name, e.phone, e.email, roleNames(e)));
  const { sort, toggle } = useTableSort<EmpSort>(null, { storageKey: "lider.table_sort.employees" });
  const getters = useMemo(
    () =>
      ({
        name: (e: Emp) => e.full_name,
        role: (e: Emp) => roleNames(e),
        phone: (e: Emp) => e.phone,
        email: (e: Emp) => e.email,
        active: (e: Emp) => e.is_active,
        login: (e: Emp) => (e.user_id ? 1 : 0),
      }) satisfies Record<EmpSort, (e: Emp) => unknown>,
    [roles],
  );
  const sorted = useSortedRows(filtered, sort, getters);
  const pendingById = useMemo(() => {
    const map = new Map<string, PendingReset>();
    for (const r of pendingResets) map.set(r.profile_id, r);
    return map;
  }, [pendingResets]);

  // Заявки на сброс — выше остальных, чтобы админ сразу видел
  const rows = useMemo(() => {
    if (pendingById.size === 0) return sorted;
    const need: Emp[] = [];
    const rest: Emp[] = [];
    for (const e of sorted) (pendingById.has(e.id) ? need : rest).push(e);
    return [...need, ...rest];
  }, [sorted, pendingById]);

  return (
    <div>
      {pendingResets.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          <p className="font-medium text-foreground">
            Нужен перевыпуск пароля ({pendingResets.length})
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Сотрудник нажал «Забыли пароль?» — откройте карточку и нажмите «Сбросить пароль».
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendingResets.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  className="text-left font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    const emp = data.find((e) => e.id === r.profile_id);
                    if (emp) setEditing(emp);
                  }}
                >
                  {r.profiles?.full_name ?? r.email}
                </button>
                <span className="text-xs text-muted-foreground">{r.email}</span>
                <span className="text-xs text-muted-foreground">· {formatRequestWhen(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
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
            {isLoading ? (
              <DirectoryTableSkeleton cols={6} />
            ) : rows.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              rows.map((e) => {
                const pending = pendingById.get(e.id);
                return (
                  <TableRow
                    key={e.id}
                    className={cn(
                      is_admin && "cursor-pointer",
                      pending && "bg-amber-500/10 hover:bg-amber-500/15",
                    )}
                    onClick={() => is_admin && setEditing(e)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-0.5">
                        <span className="leading-5">{e.full_name}</span>
                        {pending ? (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold leading-4 tracking-wide text-amber-800 dark:text-amber-300">
                            Нужен сброс
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{roleNames(e)}</TableCell>
                    <TableCell>{e.phone}</TableCell>
                    <TableCell>{e.email}</TableCell>
                    <TableCell>{e.is_active ? "Да" : "Нет"}</TableCell>
                    <TableCell>
                      {pending ? (
                        <span className="font-medium text-amber-800 dark:text-amber-300">перевыпуск</span>
                      ) : e.user_id ? (
                        "есть"
                      ) : (
                        "нет"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Новый сотрудник" : "Сотрудник"}>
        {editing !== null && (
          <EmpForm
            key={editing === "new" ? "new" : editing.id}
            emp={editing === "new" ? null : editing}
            roles={roles}
            pendingReset={
              editing !== "new" ? pendingById.get(editing.id) ?? null : null
            }
            onClose={() => setEditing(null)}
            onAccessIssued={(r) => {
              setShowIssuedPassword(false);
              setIssued(r);
            }}
          />
        )}
      </EditSheet>

      <AlertDialog
        open={!!issued}
        onOpenChange={(o) => {
          if (!o) {
            setIssued(null);
            setShowIssuedPassword(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {issued?.action === "reset_password" ? "Пароль сброшен" : "Доступ выдан"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Пароль сгенерирован{issued?.emailed ? " и отправлен на email" : ""}.
                  {!issued?.emailed && issued?.emailError
                    ? ` Письмо не ушло (${issued.emailError}). Передайте пароль сотруднику вручную.`
                    : !issued?.emailed
                      ? " Письмо не отправлено — передайте пароль сотруднику вручную."
                      : ""}
                </p>
                <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-foreground">
                  <div>Email: {issued?.email}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span>
                      Пароль:{" "}
                      {showIssuedPassword
                        ? issued?.password
                        : "•".repeat(Math.min(issued?.password?.length ?? 12, 16))}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={showIssuedPassword ? "Скрыть пароль" : "Показать пароль"}
                      onClick={() => setShowIssuedPassword((v) => !v)}
                    >
                      {showIssuedPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const text = `Email: ${issued?.email}\nПароль: ${issued?.password}`;
                    void navigator.clipboard.writeText(text).then(
                      () => toast.success("Скопировано"),
                      () => toast.error("Не удалось скопировать"),
                    );
                  }}
                >
                  Скопировать
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Готово</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmpForm({
  emp,
  roles,
  pendingReset,
  onClose,
  onAccessIssued,
}: {
  emp: Emp | null;
  roles: { code: string; name: string }[];
  pendingReset?: PendingReset | null;
  onClose: () => void;
  onAccessIssued: (r: AccessResult) => void;
}) {
  const { id: myId } = useProfile();
  const qc = useQueryClient();
  const [name, setName] = useState(emp?.full_name ?? "");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    emp?.role_codes?.length ? emp.role_codes : emp?.role_code ? [emp.role_code] : [],
  );
  const [phone, setPhone] = useState(emp?.phone ?? "");
  const [email, setEmail] = useState(emp?.email ?? "");
  const [active, setActive] = useState(emp?.is_active ?? true);
  const [accessBusy, setAccessBusy] = useState(false);
  const isSelf = emp?.id === myId;
  const hasLogin = !!emp?.user_id;
  const needsReset = !!pendingReset;

  const toggleRole = (code: string) => {
    setSelectedRoles((prev) => {
      if (prev.includes(code)) {
        const next = prev.filter((c) => c !== code);
        return next;
      }
      // Микс только сметчик + снабжение; любая другая роль — одна.
      const combinable = code === "estimator" || code === "supply";
      if (!combinable) return [code];
      const kept = prev.filter((c) => c === "estimator" || c === "supply");
      return [...new Set([...kept, code])];
    });
  };

  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: name.trim(),
        role_code: selectedRoles[0]!,
        phone: normalizePhone(phone),
        email: emptyToNull(email),
        is_active: active,
      };
      if (emp) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", emp.id);
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: rolesErr } = await (supabase as any).rpc("set_profile_roles", {
          p_profile_id: emp.id,
          p_roles: selectedRoles,
        });
        if (rolesErr) throw rolesErr;
      } else {
        const { data: created, error } = await supabase
          .from("profiles")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: rolesErr } = await (supabase as any).rpc("set_profile_roles", {
          p_profile_id: created.id,
          p_roles: selectedRoles,
        });
        if (rolesErr) throw rolesErr;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: showError,
  });

  async function runAccess(kind: "issue" | "reset") {
    if (!emp) return;
    const mail = email.trim();
    if (!mail) {
      toast.error("Сначала укажите email и сохраните карточку");
      return;
    }
    if ((emp.email ?? "") !== mail || (emp.full_name ?? "") !== name.trim()) {
      const err = validateEmployee({ full_name: name, role_codes: selectedRoles, phone, email });
      if (err) {
        toast.error(err);
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          role_code: selectedRoles[0]!,
          phone: normalizePhone(phone),
          email: emptyToNull(email),
          is_active: active,
        })
        .eq("id", emp.id);
      if (error) {
        showError(error);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rolesErr } = await (supabase as any).rpc("set_profile_roles", {
        p_profile_id: emp.id,
        p_roles: selectedRoles,
      });
      if (rolesErr) {
        showError(rolesErr);
        return;
      }
      await qc.invalidateQueries({ queryKey: KEY });
    }

    setAccessBusy(true);
    try {
      const result = kind === "issue" ? await issueAccess(emp.id) : await resetPassword(emp.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: RESET_KEY }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      onAccessIssued(result);
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setAccessBusy(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const err = validateEmployee({ full_name: name, role_codes: selectedRoles, phone, email });
        if (err) {
          toast.error(err);
          return;
        }
        m.mutate();
      }}
    >
      <Field label="ФИО" required><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></Field>
      <Field label="Роли" required>
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Обычно одна роль. Исключение: сметчик и снабжение можно вместе.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => {
              const checked = selectedRoles.includes(r.code);
              return (
                <label
                  key={r.code}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    onChange={() => toggleRole(r.code)}
                  />
                  <span>{r.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Field>
      <Field label="Телефон">
        <PhoneInput value={phone} onChange={setPhone} className="h-9 text-sm" />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
      </Field>
      <label className="flex items-center gap-3 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Активен</label>

      {emp && (
        <div
          className={cn(
            "space-y-2 rounded-md border p-3",
            needsReset
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-muted/30",
          )}
        >
          {needsReset ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Нужен перевыпуск пароля
              </p>
              <p className="text-xs text-muted-foreground">
                Заявка от {formatRequestWhen(pendingReset!.created_at)}. Нажмите «Сбросить пароль» —
                новый пароль уйдёт на email.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Доступ: {hasLogin ? "есть" : "нет"}
              </p>
              <p className="text-xs text-muted-foreground">
                Пароль генерируется автоматически и отправляется на email сотрудника.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!hasLogin ? (
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={accessBusy || m.isPending}
                onClick={() => void runAccess("issue")}
              >
                {accessBusy ? "Выдаём…" : "Выдать доступ"}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={needsReset ? "default" : "outline"}
                className="h-8"
                disabled={accessBusy || m.isPending}
                onClick={() => void runAccess("reset")}
              >
                {accessBusy ? "Сбрасываем…" : needsReset ? "Перевыпустить пароль" : "Сбросить пароль"}
              </Button>
            )}
          </div>
        </div>
      )}

      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          emp && !isSelf ? (
            <DeleteButton table="profiles" id={emp.id} name={emp.full_name} invalidate={KEY} onDone={onClose} />
          ) : undefined
        }
      />
      {isSelf && <p className="text-xs text-muted-foreground">Свой профиль удалить нельзя</p>}
    </form>
  );
}
