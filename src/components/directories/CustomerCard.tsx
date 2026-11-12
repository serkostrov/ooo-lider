import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { fieldLabelClass, fieldStackClass, tabsListClass, tabTriggerClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { statusLabel, type ObjectRow } from "@/components/objects/data";
import { DeleteButton, EditSheet } from "./common";
import { CustomerForm, CUSTOMERS_KEY, type Customer } from "./CustomerForm";
import {
  CustomerContactForm,
  customerContactsKey,
  objectContactsKey,
  type CustomerContact,
} from "./CustomerContactForm";

type CustomerTab = "contacts" | "objects";

/** Карточка заказчика: реквизиты + вкладки специалисты/объекты. */
export function CustomerCard({
  customer,
  onDeleted,
}: {
  customer: Customer;
  onDeleted: () => void;
}) {
  const { is_admin } = useProfile();
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<CustomerTab>("contacts");
  const codes: [string, string | null][] = [
    ["ИНН", customer.inn],
    ["КПП", customer.kpp],
    ["ОГРН", customer.ogrn],
  ];
  return (
    <div className="w-full space-y-6">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{customer.name}</h1>
          {is_admin && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEdit(true)}
                title="Изменить"
                aria-label="Изменить"
              >
                <Pencil className="size-4" />
              </Button>
              <DeleteButton
                table="customers"
                id={customer.id}
                name={customer.name}
                invalidate={CUSTOMERS_KEY}
                onDone={onDeleted}
              />
            </div>
          )}
        </div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {codes.map(([k, val]) => (
            <div key={k} className={fieldStackClass}>
              <dt className={fieldLabelClass}>{k}</dt>
              <dd className="text-sm">{val || "—"}</dd>
            </div>
          ))}
          <div className={`${fieldStackClass} sm:col-span-3 lg:col-span-3`}>
            <dt className={fieldLabelClass}>Адрес</dt>
            <dd className="text-sm">{customer.legal_address || "—"}</dd>
          </div>
          <div className={`${fieldStackClass} sm:col-span-3 lg:col-span-6`}>
            <dt className={fieldLabelClass}>Комментарий</dt>
            <dd className="whitespace-pre-line text-sm text-muted-foreground">
              {customer.comment || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as CustomerTab)}
        className="flex flex-col gap-6"
      >
        <TabsList className={cn(tabsListClass, "mb-0 w-fit self-start")}>
          <TabsTrigger value="contacts" className={tabTriggerClass}>
            Специалисты
          </TabsTrigger>
          <TabsTrigger value="objects" className={tabTriggerClass}>
            Объекты
          </TabsTrigger>
        </TabsList>
        <div className="w-full min-w-0">
          {tab === "contacts" ? <Contacts customerId={customer.id} /> : null}
          {tab === "objects" ? <CustomerObjects customerId={customer.id} /> : null}
        </div>
      </Tabs>

      <EditSheet open={edit} onOpenChange={setEdit} title="Заказчик" className="sm:max-w-3xl">
        {edit && (
          <CustomerForm
            key={customer.id}
            customer={customer}
            onSaved={() => setEdit(false)}
            onCancel={() => setEdit(false)}
            onDeleted={onDeleted}
          />
        )}
      </EditSheet>
    </div>
  );
}

function Contacts({ customerId }: { customerId: string }) {
  const { is_admin } = useProfile();
  const qc = useQueryClient();
  const key = customerContactsKey(customerId);
  const [editing, setEditing] = useState<CustomerContact | "new" | null>(null);
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
      return data as CustomerContact[];
    },
  });
  const close = () => setEditing(null);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          Технадзор, куратор, ГИП и другие. На объекте выбираются из этого списка.
        </p>
        {is_admin && (
          <Button
            type="button"
            onClick={() => setEditing("new")}
            className="h-8 shrink-0 gap-1.5 px-2.5 text-sm"
          >
            <Plus className="size-4" />
            Добавить
          </Button>
        )}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока никого нет — добавьте технадзора или другого специалиста
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {data.map((c, i) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="w-6 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
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
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditing(c)}
                    title="Изменить"
                    aria-label="Изменить"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <DeleteButton
                    table="customer_contacts"
                    id={c.id}
                    name={c.full_name}
                    invalidate={[...key]}
                    onDone={() => qc.invalidateQueries({ queryKey: objectContactsKey(customerId) })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <EditSheet
        open={editing !== null}
        onOpenChange={(o) => !o && close()}
        title={editing === "new" || editing === null ? "Новый специалист" : "Специалист"}
      >
        {editing !== null && (
          <CustomerContactForm
            key={editing === "new" ? "new" : editing.id}
            customerId={customerId}
            contact={editing === "new" ? null : editing}
            onClose={close}
          />
        )}
      </EditSheet>
    </div>
  );
}

function CustomerObjects({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["customer-objects", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_objects")
        .select("id, name, address, status, progress_pct, current_stage_number, current_stage_name")
        .eq("customer_id", customerId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pick<
        ObjectRow,
        | "id"
        | "name"
        | "address"
        | "status"
        | "progress_pct"
        | "current_stage_number"
        | "current_stage_name"
      >[];
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Объекты, у которых выбран этот заказчик.</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет объектов с этим заказчиком</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Текущий этап</TableHead>
                <TableHead className="w-24 text-right">Готовность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/objects/$id", params: { id: o.id } })}
                >
                  <TableCell>
                    <div className="font-medium">{o.name}</div>
                    {o.address && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{o.address}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{statusLabel(o.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.current_stage_number != null
                      ? `${o.current_stage_number}. ${o.current_stage_name ?? ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{o.progress_pct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
