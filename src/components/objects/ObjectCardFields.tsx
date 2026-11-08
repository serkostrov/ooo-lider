import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/directories/common";
import { CustomerForm } from "@/components/directories/CustomerForm";
import { CustomerContactForm } from "@/components/directories/CustomerContactForm";
import { OBJECT_STATUSES, useActiveProfiles, useCustomersShort, useObjectTypes } from "./data";

export type ObjectDraft = {
  name: string;
  address: string;
  customer_id: string;
  object_type: string;
  contract_start: string;
  contract_end: string;
  responsible_id: string;
  curator_contact_id: string;
  technadzor_contact_id: string;
  technadzor_ehz_contact_id: string;
  status: "planned" | "in_work" | "completed";
  notes: string;
};

export const EMPTY_DRAFT: ObjectDraft = {
  name: "",
  address: "",
  customer_id: "",
  object_type: "",
  contract_start: "",
  contract_end: "",
  responsible_id: "",
  curator_contact_id: "",
  technadzor_contact_id: "",
  technadzor_ehz_contact_id: "",
  status: "in_work",
  notes: "",
};

const NONE = "__none";

type ContactRole = "curator_contact_id" | "technadzor_contact_id" | "technadzor_ehz_contact_id";

const CONTACT_FIELDS: { key: ContactRole; label: string; position: string }[] = [
  { key: "curator_contact_id", label: "Куратор", position: "Куратор" },
  { key: "technadzor_contact_id", label: "Технадзор", position: "Технадзор" },
  { key: "technadzor_ehz_contact_id", label: "Технадзор ЭХЗ", position: "Технадзор ЭХЗ" },
];

export function validateDraft(d: ObjectDraft): string | null {
  if (!d.name.trim()) return "Укажите название договора объекта";
  if (!d.customer_id) return "Выберите заказчика";
  if (!d.object_type) return "Выберите тип объекта";
  if (!d.contract_start || !d.contract_end) return "Укажите даты начала и окончания по договору";
  if (d.contract_end < d.contract_start) return "Дата окончания раньше даты начала";
  return null;
}

export function draftToPayload(d: ObjectDraft) {
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    name: d.name.trim(),
    address: t(d.address),
    customer_id: d.customer_id || null,
    object_type: d.object_type,
    contract_start: d.contract_start || null,
    contract_end: d.contract_end || null,
    responsible_id: d.responsible_id || null,
    curator_contact_id: d.curator_contact_id || null,
    technadzor_contact_id: d.technadzor_contact_id || null,
    technadzor_ehz_contact_id: d.technadzor_ehz_contact_id || null,
    status: d.status,
    notes: t(d.notes),
  };
}

function useCustomerContacts(customerId: string) {
  return useQuery({
    queryKey: ["customer-contacts", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_contacts")
        .select("id, full_name, position")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("sort");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function ContactSelect({
  label,
  value,
  contacts,
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  contacts: { id: string; full_name: string; position: string | null }[];
  onChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
          <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
            <SelectValue placeholder="Не выбран" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-sm">
              Не выбран
            </SelectItem>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.full_name}
                {c.position ? ` — ${c.position}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0"
          onClick={onAdd}
          title={`Добавить: ${label}`}
          aria-label={`Добавить: ${label}`}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </Field>
  );
}

export function ObjectCardFields({
  value,
  onChange,
  showStatus,
}: {
  value: ObjectDraft;
  onChange: (v: ObjectDraft) => void;
  showStatus?: boolean;
}) {
  const { data: customers = [] } = useCustomersShort();
  const { data: profiles = [] } = useActiveProfiles();
  const { data: contacts = [] } = useCustomerContacts(value.customer_id);
  const [addCustomer, setAddCustomer] = useState(false);
  const [addContact, setAddContact] = useState<{ key: ContactRole; position: string; label: string } | null>(null);
  const set = <K extends keyof ObjectDraft>(k: K, v: ObjectDraft[K]) => onChange({ ...value, [k]: v });

  const { all: objectTypes, active: activeTypes } = useObjectTypes();
  const typeChoices = objectTypes.filter((t) => !t.deleted_at || t.code === value.object_type);
  const firstType = activeTypes[0]?.code;
  useEffect(() => {
    if (!value.object_type && firstType) onChange({ ...value, object_type: firstType });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только когда справочник загрузился
  }, [firstType]);

  const setCustomer = (customerId: string) => {
    onChange({
      ...value,
      customer_id: customerId,
      curator_contact_id: "",
      technadzor_contact_id: "",
      technadzor_ehz_contact_id: "",
    });
  };

  return (
    <div className="w-full space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Название договора объекта" required>
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} className="h-9 text-sm" />
        </Field>
        <Field label="Адрес">
          <Input value={value.address} onChange={(e) => set("address", e.target.value)} className="h-9 text-sm" />
        </Field>
      </div>

      <Field label="Заказчик" required>
        <div className="flex gap-2">
          <Select value={value.customer_id} onValueChange={setCustomer}>
            <SelectTrigger className="h-9 min-w-0 flex-1 text-sm">
              <SelectValue placeholder="Выберите заказчика" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setAddCustomer(true)}
            title="Добавить заказчика"
            aria-label="Добавить заказчика"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </Field>

      {value.customer_id && (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium">Специалисты заказчика на объекте</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Не пользователи системы: ФИО ведутся у заказчика (Справочники → Заказчики). «+» — добавить и сразу
              назначить.
            </p>
          </div>
          {contacts.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              У этого заказчика ещё нет специалистов. Нажмите «+» у нужной роли или{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() =>
                  setAddContact({
                    key: "technadzor_contact_id",
                    position: "Технадзор",
                    label: "Технадзор",
                  })
                }
              >
                добавьте технадзора
              </button>
              .
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CONTACT_FIELDS.map((f) => (
              <ContactSelect
                key={f.key}
                label={f.label}
                value={value[f.key]}
                contacts={contacts}
                onChange={(v) => set(f.key, v)}
                onAdd={() => setAddContact(f)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Тип объекта">
          <Select value={value.object_type} onValueChange={(v) => set("object_type", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Выберите тип" />
            </SelectTrigger>
            <SelectContent>
              {typeChoices.map((t) => (
                <SelectItem key={t.code} value={t.code} className="text-sm">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">Справочники → Типы объектов</p>
        </Field>
        <Field label="Ответственный">
          <Select
            value={value.responsible_id || NONE}
            onValueChange={(v) => set("responsible_id", v === NONE ? "" : v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-sm">
                Не выбран
              </SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата начала по договору" required>
          <Input
            type="date"
            value={value.contract_start}
            onChange={(e) => set("contract_start", e.target.value)}
            className="h-9 text-sm"
          />
        </Field>
        <Field label="Дата окончания по договору" required>
          <Input
            type="date"
            value={value.contract_end}
            min={value.contract_start || undefined}
            onChange={(e) => set("contract_end", e.target.value)}
            className="h-9 text-sm"
          />
        </Field>
        {showStatus && (
          <Field label="Статус объекта">
            <Select value={value.status} onValueChange={(v) => set("status", v as ObjectDraft["status"])}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECT_STATUSES.map((t) => (
                  <SelectItem key={t.v} value={t.v} className="text-sm">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Примечание">
        <Textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          className="min-h-20 resize-y text-sm"
        />
      </Field>

      <Dialog open={addCustomer} onOpenChange={setAddCustomer}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">Новый заказчик</DialogTitle>
          </DialogHeader>
          <CustomerForm
            onSaved={(c) => {
              setCustomer(c.id);
              setAddCustomer(false);
            }}
            onCancel={() => setAddCustomer(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!addContact}
        onOpenChange={(o) => {
          if (!o) setAddContact(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {addContact ? `Новый специалист · ${addContact.label}` : "Новый специалист"}
            </DialogTitle>
          </DialogHeader>
          {addContact && value.customer_id && (
            <CustomerContactForm
              key={addContact.key}
              customerId={value.customer_id}
              contact={null}
              defaultPosition={addContact.position}
              onClose={() => setAddContact(null)}
              onSaved={(c) => set(addContact.key, c.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
