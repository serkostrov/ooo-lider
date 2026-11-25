import { useState } from "react";
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
import {
  DeleteButton,
  EditSheet,
  EmptyRow,
  Field,
  FormActions,
  MultiValueInputs,
  Toolbar,
  emptyToNull,
  matches,
} from "./common";
import { DirectoryTableSkeleton } from "./DirectorySkeleton";
import {
  CONTACT_POSITIONS,
  joinMultiContacts,
  splitMultiContacts,
  validateExternalContact,
} from "./rules";
import { CUSTOMERS_KEY, type Customer } from "./CustomerForm";

export const EXTERNAL_CONTACTS_KEY = ["dir-external-contacts"] as const;

const NONE_CUSTOMER = "__none";

export type ExternalContactKind = "person" | "org" | "service";

export const EXTERNAL_CONTACT_KINDS: { v: ExternalContactKind; label: string }[] = [
  { v: "person", label: "Человек" },
  { v: "org", label: "Организация" },
  { v: "service", label: "Служба / отдел" },
];

export type ExternalContact = {
  id: string;
  kind: ExternalContactKind;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  customer_id: string | null;
  customer_name: string | null;
  is_active: boolean;
};

type SortKey = "kind" | "full_name" | "customer" | "position" | "phone" | "email" | "active";

const GETTERS: Record<SortKey, (r: ExternalContact) => unknown> = {
  kind: (r) => r.kind,
  full_name: (r) => r.full_name,
  customer: (r) => r.customer_name,
  position: (r) => r.position,
  phone: (r) => r.phone,
  email: (r) => r.email,
  active: (r) => r.is_active,
};

function parseKind(raw: unknown): ExternalContactKind {
  if (raw === "org" || raw === "service" || raw === "person") return raw;
  return "person";
}

function kindLabel(kind: ExternalContactKind) {
  return EXTERNAL_CONTACT_KINDS.find((k) => k.v === kind)?.label ?? kind;
}

export function useExternalContacts(activeOnly = false) {
  return useQuery({
    queryKey: [...EXTERNAL_CONTACTS_KEY, activeOnly ? "active" : "all"],
    retry: false,
    queryFn: async () => {
      let q = supabase
        .from("external_contacts")
        .select(
          "id, kind, full_name, position, phone, email, comment, customer_id, is_active, customers(name)",
        )
        .is("deleted_at", null)
        .order("sort")
        .order("full_name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as {
          id: string;
          kind?: string;
          full_name: string;
          position: string | null;
          phone: string | null;
          email: string | null;
          comment: string | null;
          customer_id: string | null;
          is_active: boolean;
          customers?: { name: string } | { name: string }[] | null;
        };
        const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
        return {
          id: row.id,
          kind: parseKind(row.kind),
          full_name: row.full_name,
          position: row.position,
          phone: row.phone,
          email: row.email,
          comment: row.comment,
          customer_id: row.customer_id,
          customer_name: cust?.name ?? null,
          is_active: row.is_active,
        } satisfies ExternalContact;
      });
    },
  });
}

export function ExternalContactsDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ExternalContact | "new" | null>(null);
  const { data = [], isLoading, isError, error, refetch } = useExternalContacts(false);
  const filtered = data.filter((r) =>
    matches(
      search,
      r.full_name,
      r.position,
      r.phone,
      r.email,
      r.comment,
      r.customer_name,
      kindLabel(r.kind),
    ),
  );
  const { sort, toggle } = useTableSort<SortKey>();
  const rows = useSortedRows(filtered, sort, GETTERS);

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Общий список: люди, организации и службы. На карточке этапа их можно привязать к этапу.
        В телефоне и почте можно указать несколько через «;».
      </p>
      {isError ? (
        <p className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Не удалось загрузить контакты:{" "}
          {error instanceof Error ? error.message : "ошибка БД"}.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Повторить
          </button>
        </p>
      ) : null}
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setEditing("new") : undefined} />
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="kind" sort={sort} onToggle={toggle}>
                Тип
              </SortableTh>
              <SortableTh as="table" column="full_name" sort={sort} onToggle={toggle}>
                ФИО / название
              </SortableTh>
              <SortableTh as="table" column="customer" sort={sort} onToggle={toggle}>
                Заказчик
              </SortableTh>
              <SortableTh as="table" column="position" sort={sort} onToggle={toggle}>
                Должность
              </SortableTh>
              <SortableTh as="table" column="phone" sort={sort} onToggle={toggle}>
                Телефон
              </SortableTh>
              <SortableTh as="table" column="email" sort={sort} onToggle={toggle}>
                Почта
              </SortableTh>
              <SortableTh as="table" column="active" sort={sort} onToggle={toggle}>
                Активен
              </SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DirectoryTableSkeleton cols={7} />
            ) : isError || rows.length === 0 ? (
              <EmptyRow cols={7} />
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  className={is_admin ? "cursor-pointer" : ""}
                  onClick={() => is_admin && setEditing(r)}
                >
                  <TableCell className="text-muted-foreground">{kindLabel(r.kind)}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.customer_name ?? "—"}</TableCell>
                  <TableCell>{r.position}</TableCell>
                  <TableCell className="max-w-[18rem] whitespace-nowrap">
                    <span className="inline-block max-w-full overflow-x-auto align-bottom">
                      {r.phone}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[18rem] whitespace-nowrap">
                    <span className="inline-block max-w-full overflow-x-auto align-bottom">
                      {r.email}
                    </span>
                  </TableCell>
                  <TableCell>{r.is_active ? "Да" : "Нет"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Новый контакт" : "Внешний контакт"}
      >
        {editing !== null && (
          <ExternalContactForm
            key={editing === "new" ? "new" : editing.id}
            contact={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </EditSheet>
    </div>
  );
}

export function ExternalContactForm({
  contact,
  onClose,
  onSaved,
}: {
  contact: ExternalContact | null;
  onClose: () => void;
  onSaved?: (c: ExternalContact) => void;
}) {
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, inn, kpp, ogrn, legal_address, comment")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
  const [v, setV] = useState({
    kind: (contact?.kind ?? "person") as ExternalContactKind,
    full_name: contact?.full_name ?? "",
    position: contact?.position ?? "",
    phones: splitMultiContacts(contact?.phone),
    emails: splitMultiContacts(contact?.email),
    comment: contact?.comment ?? "",
    customer_id: contact?.customer_id ?? "",
    is_active: contact?.is_active ?? true,
  });
  const set = (k: "full_name" | "position" | "comment") => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const nameLabel =
    v.kind === "person" ? "ФИО" : v.kind === "org" ? "Название организации" : "Название службы";
  const positionLabel = v.kind === "person" ? "Должность" : "Подпись / роль";

  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        kind: v.kind,
        full_name: v.full_name.trim(),
        position: emptyToNull(v.position),
        phone: joinMultiContacts(v.phones),
        email: joinMultiContacts(v.emails),
        comment: emptyToNull(v.comment),
        customer_id: v.customer_id || null,
        is_active: v.is_active,
      };
      const selectCols =
        "id, kind, full_name, position, phone, email, comment, customer_id, is_active, customers(name)";
      if (contact) {
        const { data, error } = await supabase
          .from("external_contacts")
          .update(payload)
          .eq("id", contact.id)
          .select(selectCols)
          .single();
        if (error) throw error;
        const cust = Array.isArray(data.customers) ? data.customers[0] : data.customers;
        return {
          ...data,
          kind: parseKind(data.kind),
          customer_name: (cust as { name?: string } | null)?.name ?? null,
        } as ExternalContact;
      }
      const { count } = await supabase
        .from("external_contacts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      const { data, error } = await supabase
        .from("external_contacts")
        .insert({ ...payload, sort: (count ?? 0) + 1 })
        .select(selectCols)
        .single();
      if (error) throw error;
      const cust = Array.isArray(data.customers) ? data.customers[0] : data.customers;
      return {
        ...data,
        kind: parseKind(data.kind),
        customer_name: (cust as { name?: string } | null)?.name ?? null,
      } as ExternalContact;
    },
    onSuccess: async (c) => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: EXTERNAL_CONTACTS_KEY });
      if (c.customer_id && c.kind === "person") {
        // Чтобы появился в «Специалистах» заказчика / выборе на объекте
        const { data: existing } = await supabase
          .from("customer_contacts")
          .select("id")
          .eq("customer_id", c.customer_id)
          .is("deleted_at", null)
          .ilike("full_name", c.full_name.trim())
          .maybeSingle();
        if (!existing) {
          const { count } = await supabase
            .from("customer_contacts")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", c.customer_id)
            .is("deleted_at", null);
          await supabase.from("customer_contacts").insert({
            customer_id: c.customer_id,
            full_name: c.full_name,
            position: c.position,
            phone: c.phone,
            email: c.email,
            comment: c.comment ?? "из внешних контактов",
            sort: (count ?? 0) + 1,
          });
          qc.invalidateQueries({ queryKey: ["dir-customer-contacts", c.customer_id] });
          qc.invalidateQueries({ queryKey: ["customer-contacts", c.customer_id] });
        }
      }
      onSaved?.(c);
      onClose();
    },
    onError: showError,
  });

  const cls = "h-9 text-sm";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const err = validateExternalContact({
          full_name: v.full_name,
          phone: joinMultiContacts(v.phones) ?? "",
          email: joinMultiContacts(v.emails) ?? "",
        });
        if (err) {
          toast.error(err);
          return;
        }
        m.mutate();
      }}
    >
      <Field label="Тип" required>
        <Select
          value={v.kind}
          onValueChange={(kind) => setV((s) => ({ ...s, kind: kind as ExternalContactKind }))}
        >
          <SelectTrigger className={cls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXTERNAL_CONTACT_KINDS.map((k) => (
              <SelectItem key={k.v} value={k.v} className="text-sm">
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Заказчик">
        <Select
          value={v.customer_id || NONE_CUSTOMER}
          onValueChange={(id) =>
            setV((s) => ({ ...s, customer_id: id === NONE_CUSTOMER ? "" : id }))
          }
        >
          <SelectTrigger className={cls}>
            <SelectValue placeholder="Не привязан" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_CUSTOMER} className="text-sm">
              Не привязан
            </SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Человека с заказчиком можно выбрать на объекте как специалиста.
        </p>
      </Field>
      <Field label={nameLabel} required>
        <Input value={v.full_name} onChange={set("full_name")} className={cls} autoFocus />
      </Field>
      <Field label={positionLabel}>
        <Input
          value={v.position}
          onChange={set("position")}
          className={cls}
          list="external-contact-positions"
          placeholder={v.kind === "person" ? "Технадзор, ГИП, куратор…" : "необязательно"}
        />
        <datalist id="external-contact-positions">
          {CONTACT_POSITIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <Field label="Телефон">
        <MultiValueInputs
          values={v.phones}
          onChange={(phones) => setV((s) => ({ ...s, phones }))}
          type="tel"
          placeholder="8(495)123-45-67"
          addLabel="Добавить телефон"
        />
      </Field>
      <Field label="Почта">
        <MultiValueInputs
          values={v.emails}
          onChange={(emails) => setV((s) => ({ ...s, emails }))}
          type="email"
          placeholder="name@company.ru"
          addLabel="Добавить email"
        />
      </Field>
      <Field label="Комментарий">
        <Textarea value={v.comment} onChange={set("comment")} className="text-sm" />
      </Field>
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={v.is_active}
          onCheckedChange={(is_active) => setV((s) => ({ ...s, is_active }))}
        />
        Активен
      </label>
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          contact ? (
            <DeleteButton
              table="external_contacts"
              id={contact.id}
              name={contact.full_name}
              invalidate={[...EXTERNAL_CONTACTS_KEY]}
              onDone={onClose}
            />
          ) : undefined
        }
      />
    </form>
  );
}
