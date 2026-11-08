import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteButton, Field, FormActions, emptyToNull } from "./common";

/** Типовые роли специалистов заказчика — подсказки в поле «Должность». */
export const CONTACT_POSITIONS = [
  "Куратор",
  "Технадзор",
  "Технадзор ЭХЗ",
  "ГИП",
  "Геотрест",
] as const;

export type CustomerContact = {
  id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
};

export function customerContactsKey(customerId: string) {
  return ["dir-customer-contacts", customerId] as const;
}

export function objectContactsKey(customerId: string) {
  return ["customer-contacts", customerId] as const;
}

/** Форма контакта заказчика. `defaultPosition` — при создании с объекта (технадзор и т. п.). */
export function CustomerContactForm({
  customerId,
  contact,
  defaultPosition = "",
  onClose,
  onSaved,
}: {
  customerId: string;
  contact: CustomerContact | null;
  defaultPosition?: string;
  onClose: () => void;
  onSaved?: (c: CustomerContact) => void;
}) {
  const qc = useQueryClient();
  const invalidate = customerContactsKey(customerId);
  const [v, setV] = useState({
    full_name: contact?.full_name ?? "",
    position: contact?.position ?? defaultPosition,
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
      if (contact) {
        const { data, error } = await supabase
          .from("customer_contacts")
          .update(payload)
          .eq("id", contact.id)
          .select("id, full_name, position, phone, email, comment")
          .single();
        if (error) throw error;
        return data as CustomerContact;
      }
      const { count } = await supabase
        .from("customer_contacts")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .is("deleted_at", null);
      const { data, error } = await supabase
        .from("customer_contacts")
        .insert({ ...payload, customer_id: customerId, sort: (count ?? 0) + 1 })
        .select("id, full_name, position, phone, email, comment")
        .single();
      if (error) throw error;
      return data as CustomerContact;
    },
    onSuccess: (c) => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: invalidate });
      qc.invalidateQueries({ queryKey: objectContactsKey(customerId) });
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
        if (!v.full_name.trim()) {
          toast.error("Заполните ФИО");
          return;
        }
        m.mutate();
      }}
    >
      <Field label="ФИО" required>
        <Input value={v.full_name} onChange={set("full_name")} className={cls} autoFocus />
      </Field>
      <Field label="Должность / роль">
        <Input
          value={v.position}
          onChange={set("position")}
          className={cls}
          list="customer-contact-positions"
          placeholder="Технадзор, ГИП, куратор…"
        />
        <datalist id="customer-contact-positions">
          {CONTACT_POSITIONS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Телефон">
          <Input value={v.phone} onChange={set("phone")} className={cls} />
        </Field>
        <Field label="Email">
          <Input type="email" value={v.email} onChange={set("email")} className={cls} />
        </Field>
      </div>
      <Field label="Комментарий">
        <Textarea value={v.comment} onChange={set("comment")} className="text-sm" />
      </Field>
      <FormActions
        pending={m.isPending}
        onCancel={onClose}
        danger={
          contact ? (
            <DeleteButton
              table="customer_contacts"
              id={contact.id}
              name={contact.full_name}
              invalidate={[...invalidate]}
              onDone={() => {
                qc.invalidateQueries({ queryKey: objectContactsKey(customerId) });
                onClose();
              }}
            />
          ) : undefined
        }
      />
    </form>
  );
}
