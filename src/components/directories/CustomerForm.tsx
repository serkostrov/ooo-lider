import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteButton, Field, FormActions, emptyToNull } from "./common";

export type Customer = {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legal_address: string | null;
  comment: string | null;
};

export const CUSTOMERS_KEY = ["dir-customers"];

/** Форма создания/редактирования заказчика. Переиспользуется в модальном окне при создании объекта. */
export function CustomerForm({
  customer,
  onSaved,
  onCancel,
  onDeleted,
}: {
  customer?: Customer | null;
  onSaved: (c: Customer) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    name: customer?.name ?? "",
    inn: customer?.inn ?? "",
    kpp: customer?.kpp ?? "",
    ogrn: customer?.ogrn ?? "",
    legal_address: customer?.legal_address ?? "",
    comment: customer?.comment ?? "",
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        name: v.name.trim(),
        inn: emptyToNull(v.inn),
        kpp: emptyToNull(v.kpp),
        ogrn: emptyToNull(v.ogrn),
        legal_address: emptyToNull(v.legal_address),
        comment: emptyToNull(v.comment),
      };
      const cols = "id, name, inn, kpp, ogrn, legal_address, comment";
      const { data, error } = customer
        ? await supabase.from("customers").update(payload).eq("id", customer.id).select(cols).single()
        : await supabase.from("customers").insert(payload).select(cols).single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: (c) => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      onSaved(c);
    },
    onError: showError,
  });
  const cls = "h-9 text-sm";
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) { toast.error("Заполните название"); return; }
        m.mutate();
      }}
    >
      <Field label="Название" required><Input value={v.name} onChange={set("name")} className={cls} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ИНН"><Input value={v.inn} onChange={set("inn")} className={cls} /></Field>
        <Field label="КПП"><Input value={v.kpp} onChange={set("kpp")} className={cls} /></Field>
        <Field label="ОГРН"><Input value={v.ogrn} onChange={set("ogrn")} className={cls} /></Field>
      </div>
      <Field label="Адрес"><Input value={v.legal_address} onChange={set("legal_address")} className={cls} /></Field>
      <Field label="Комментарий"><Textarea value={v.comment} onChange={set("comment")} className="text-sm" /></Field>
      <FormActions
        pending={m.isPending}
        onCancel={onCancel}
        danger={
          customer ? (
            <DeleteButton
              table="customers"
              id={customer.id}
              name={customer.name}
              invalidate={CUSTOMERS_KEY}
              onDone={onDeleted ?? onCancel}
            />
          ) : undefined
        }
      />
    </form>
  );
}
