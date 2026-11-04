import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh } from "@/components/SortableTh";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { DeleteButton, EditSheet, EmptyRow, Field, FormActions, Toolbar, emptyToNull, matches } from "./common";
import { CustomerForm, CUSTOMERS_KEY, type Customer } from "./CustomerForm";

type CustSort = "name" | "inn" | "address" | "comment";
const CUST_GETTERS: Record<CustSort, (c: Customer) => unknown> = {
  name: (c) => c.name,
  inn: (c) => c.inn,
  address: (c) => c.legal_address,
  comment: (c) => c.comment,
};

export function CustomersDirectory() {
  const { is_admin } = useProfile();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
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
  const filtered = data.filter((c) => matches(search, c.name, c.inn, c.legal_address, c.comment));
  const { sort, toggle } = useTableSort<CustSort>();
  const rows = useSortedRows(filtered, sort, CUST_GETTERS);
  const current = data.find((c) => c.id === openId) ?? null;
  return (
    <div>
      <Toolbar search={search} onSearch={setSearch} onAdd={is_admin ? () => setCreating(true) : undefined} />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle}>Название</SortableTh>
              <SortableTh as="table" column="inn" sort={sort} onToggle={toggle}>ИНН</SortableTh>
              <SortableTh as="table" column="address" sort={sort} onToggle={toggle}>Адрес</SortableTh>
              <SortableTh as="table" column="comment" sort={sort} onToggle={toggle}>Комментарий</SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : rows.length === 0 ? (
              <EmptyRow cols={4} />
            ) : (
              rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.inn}</TableCell>
                  <TableCell>{c.legal_address}</TableCell>
                  <TableCell className="text-muted-foreground">{c.comment}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <EditSheet open={creating} onOpenChange={setCreating} title="Новый заказчик" className="sm:max-w-3xl">
        {creating && (
          <CustomerForm
            onSaved={(c) => {
              setCreating(false);
              setOpenId(c.id);
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </EditSheet>
      <EditSheet open={!!current} onOpenChange={(o) => !o && setOpenId(null)} title="Заказчик" className="sm:max-w-3xl">
        {current && <CustomerCard key={current.id} customer={current} onClose={() => setOpenId(null)} />}
      </EditSheet>
    </div>
  );
}

function CustomerCard({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { is_admin } = useProfile();
  const [edit, setEdit] = useState(false);
  const codes: [string, string | null][] = [
    ["ИНН", customer.inn],
    ["КПП", customer.kpp],
    ["ОГРН", customer.ogrn],
  ];
  return (
    <div className="w-full space-y-5">
      {edit ? (
        <CustomerForm
          customer={customer}
          onSaved={() => setEdit(false)}
          onCancel={() => setEdit(false)}
          onDeleted={onClose}
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-lg font-semibold tracking-tight">{customer.name}</div>
            {is_admin && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="icon" onClick={() => setEdit(true)} title="Изменить" aria-label="Изменить">
                  <Pencil className="size-4" />
                </Button>
                <DeleteButton table="customers" id={customer.id} name={customer.name} invalidate={CUSTOMERS_KEY} onDone={onClose} />
              </div>
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {codes.map(([k, val]) => (
              <div key={k} className={fieldStackClass}>
                <dt className={fieldLabelClass}>{k}</dt>
                <dd className="text-sm">{val || "—"}</dd>
              </div>
            ))}
            <div className={`${fieldStackClass} sm:col-span-3`}>
              <dt className={fieldLabelClass}>Адрес</dt>
              <dd className="text-sm">{customer.legal_address || "—"}</dd>
            </div>
            <div className={`${fieldStackClass} sm:col-span-3`}>
              <dt className={fieldLabelClass}>Комментарий</dt>
              <dd className="whitespace-pre-line text-sm text-muted-foreground">{customer.comment || "—"}</dd>
            </div>
          </dl>
        </div>
      )}
      <Contacts customerId={customer.id} />
    </div>
  );
}

type Contact = { id: string; full_name: string; position: string | null; phone: string | null; email: string | null; comment: string | null };

function Contacts({ customerId }: { customerId: string }) {
  const { is_admin } = useProfile();
  const key = ["dir-customer-contacts", customerId];
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_contacts")
        .select("id, full_name, position, phone, email, comment")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return data as Contact[];
    },
  });
  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Контактные лица</h3>
        {is_admin && editing === null && (
          <Button onClick={() => setEditing("new")} size="icon" className="size-8" title="Добавить" aria-label="Добавить">
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {editing === "new" && <ContactForm customerId={customerId} contact={null} invalidate={key} onClose={() => setEditing(null)} />}
      {data.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">Контактов нет</p>}
      {data.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.map((c) =>
            editing !== null && editing !== "new" && editing.id === c.id ? (
              <li key={c.id} className="bg-muted/40 p-4">
                <ContactForm customerId={customerId} contact={c} invalidate={key} onClose={() => setEditing(null)} />
              </li>
            ) : (
              <li key={c.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium">{c.full_name}</span>
                    {c.position && <span className="text-muted-foreground">{c.position}</span>}
                  </div>
                  {(c.phone || c.email || c.comment) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                      {c.phone && <span>{c.phone}</span>}
                      {c.email && <span className="truncate">{c.email}</span>}
                      {c.comment && <span className="truncate">{c.comment}</span>}
                    </div>
                  )}
                </div>
                {is_admin && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setEditing(c)}
                      title="Изменить"
                      aria-label="Изменить"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <DeleteButton table="customer_contacts" id={c.id} name={c.full_name} invalidate={key} />
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ContactForm({
  customerId,
  contact,
  invalidate,
  onClose,
}: {
  customerId: string;
  contact: Contact | null;
  invalidate: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    full_name: contact?.full_name ?? "",
    position: contact?.position ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    comment: contact?.comment ?? "",
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: v.full_name.trim(),
        position: emptyToNull(v.position),
        phone: emptyToNull(v.phone),
        email: emptyToNull(v.email),
        comment: emptyToNull(v.comment),
      };
      const { error } = contact
        ? await supabase.from("customer_contacts").update(payload).eq("id", contact.id)
        : await supabase.from("customer_contacts").insert({ ...payload, customer_id: customerId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: invalidate });
      onClose();
    },
    onError: showError,
  });
  const cls = "h-9 text-sm";
  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-muted/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.full_name.trim()) { toast.error("Заполните ФИО"); return; }
        m.mutate();
      }}
    >
      <Field label="ФИО" required><Input value={v.full_name} onChange={set("full_name")} className={cls} /></Field>
      <Field label="Должность"><Input value={v.position} onChange={set("position")} className={cls} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Телефон"><Input value={v.phone} onChange={set("phone")} className={cls} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={set("email")} className={cls} /></Field>
      </div>
      <Field label="Комментарий"><Textarea value={v.comment} onChange={set("comment")} className="text-sm" /></Field>
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          contact ? (
            <DeleteButton
              table="customer_contacts"
              id={contact.id}
              name={contact.full_name}
              invalidate={invalidate}
              onDone={onClose}
            />
          ) : undefined
        }
      />
    </form>
  );
}
