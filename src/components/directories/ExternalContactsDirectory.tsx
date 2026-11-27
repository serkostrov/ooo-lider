import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { showError } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DeleteButton,
  Field,
  FormActions,
  MultiValueInputs,
  emptyToNull,
} from "./common";
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
  { v: "person", label: "Контакт" },
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
  parent_id: string | null;
  is_active: boolean;
};

export function isGroupKind(kind: ExternalContactKind) {
  return kind === "org" || kind === "service";
}

function parseKind(raw: unknown): ExternalContactKind {
  if (raw === "org" || raw === "service" || raw === "person") return raw;
  return "person";
}

export function kindLabel(kind: ExternalContactKind) {
  return EXTERNAL_CONTACT_KINDS.find((k) => k.v === kind)?.label ?? kind;
}

function mapRow(r: {
  id: string;
  kind?: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  comment: string | null;
  customer_id: string | null;
  parent_id?: string | null;
  is_active: boolean;
  customers?: { name: string } | { name: string }[] | null;
}): ExternalContact {
  const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
  return {
    id: r.id,
    kind: parseKind(r.kind),
    full_name: r.full_name,
    position: r.position,
    phone: r.phone,
    email: r.email,
    comment: r.comment,
    customer_id: r.customer_id,
    customer_name: cust?.name ?? null,
    parent_id: r.parent_id ?? null,
    is_active: r.is_active,
  };
}

const SELECT_COLS =
  "id, kind, full_name, position, phone, email, comment, customer_id, parent_id, is_active, customers(name)";

export function useExternalContacts(activeOnly = false) {
  return useQuery({
    queryKey: [...EXTERNAL_CONTACTS_KEY, activeOnly ? "active" : "all"],
    retry: false,
    queryFn: async () => {
      let q = supabase
        .from("external_contacts")
        .select(SELECT_COLS)
        .is("deleted_at", null)
        .order("sort")
        .order("full_name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
    },
  });
}

/** Корневые контакты (без родителя). */
export function topLevelContacts(rows: ExternalContact[]) {
  return rows.filter((r) => !r.parent_id);
}

/** Люди внутри группы. */
export function childrenOf(rows: ExternalContact[], parentId: string) {
  return rows
    .filter((r) => r.parent_id === parentId)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
}

type MemberDraft = {
  key: string;
  id?: string;
  full_name: string;
  position: string;
  phones: string[];
  emails: string[];
  is_active: boolean;
};

function emptyMember(): MemberDraft {
  return {
    key: crypto.randomUUID(),
    full_name: "",
    position: "",
    phones: [""],
    emails: [""],
    is_active: true,
  };
}

export function ExternalContactForm({
  contact,
  onClose,
  onSaved,
  defaultCustomerId,
}: {
  contact: ExternalContact | null;
  onClose: () => void;
  onSaved?: (c: ExternalContact) => void;
  /** Предзаполнить заказчика при создании. */
  defaultCustomerId?: string | null;
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
  const childrenQuery = useQuery({
    queryKey: [...EXTERNAL_CONTACTS_KEY, "children", contact?.id ?? "new"],
    enabled: !!contact && isGroupKind(contact.kind),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_contacts")
        .select(SELECT_COLS)
        .eq("parent_id", contact!.id)
        .is("deleted_at", null)
        .order("sort")
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as Parameters<typeof mapRow>[0]));
    },
  });
  const existingChildren = childrenQuery.data ?? [];

  const [v, setV] = useState({
    kind: (contact?.kind ?? "person") as ExternalContactKind,
    full_name: contact?.full_name ?? "",
    position: contact?.position ?? "",
    phones: splitMultiContacts(contact?.phone),
    emails: splitMultiContacts(contact?.email),
    comment: contact?.comment ?? "",
    customer_id: contact?.customer_id ?? defaultCustomerId ?? "",
    is_active: contact?.is_active ?? true,
  });
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [membersHydrated, setMembersHydrated] = useState(false);

  useEffect(() => {
    if (!contact || !isGroupKind(contact.kind)) {
      setMembers([]);
      setMembersHydrated(true);
      return;
    }
    if (!childrenQuery.isSuccess || membersHydrated) return;
    setMembers(
      existingChildren.map((k) => ({
        key: k.id,
        id: k.id,
        full_name: k.full_name,
        position: k.position ?? "",
        phones: splitMultiContacts(k.phone),
        emails: splitMultiContacts(k.email),
        is_active: k.is_active,
      })),
    );
    setMembersHydrated(true);
  }, [contact, childrenQuery.isSuccess, existingChildren, membersHydrated]);

  const set = (k: "full_name" | "position" | "comment") => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const nameLabel =
    v.kind === "person" ? "ФИО" : v.kind === "org" ? "Название организации" : "Название службы";
  const positionLabel = v.kind === "person" ? "Должность" : "Подпись / роль";
  const groupMode = isGroupKind(v.kind);

  const softDeleteChildren = async (parentId: string) => {
    await supabase
      .from("external_contacts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("parent_id", parentId)
      .is("deleted_at", null);
  };

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
        parent_id: null as string | null,
        is_active: v.is_active,
      };

      let saved: ExternalContact;
      if (contact) {
        const { data, error } = await supabase
          .from("external_contacts")
          .update(payload)
          .eq("id", contact.id)
          .select(SELECT_COLS)
          .single();
        if (error) throw error;
        saved = mapRow(data as Parameters<typeof mapRow>[0]);
      } else {
        const { count } = await supabase
          .from("external_contacts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null);
        const { data, error } = await supabase
          .from("external_contacts")
          .insert({ ...payload, sort: (count ?? 0) + 1 })
          .select(SELECT_COLS)
          .single();
        if (error) throw error;
        saved = mapRow(data as Parameters<typeof mapRow>[0]);
      }

      if (isGroupKind(saved.kind)) {
        const keepIds = new Set<string>();
        let sortBase = 0;
        for (const mem of members) {
          const name = mem.full_name.trim();
          if (!name) continue;
          const childPayload = {
            kind: "person" as const,
            full_name: name,
            position: emptyToNull(mem.position),
            phone: joinMultiContacts(mem.phones),
            email: joinMultiContacts(mem.emails),
            comment: null as string | null,
            customer_id: saved.customer_id,
            parent_id: saved.id,
            is_active: mem.is_active,
          };
          if (mem.id) {
            const { error } = await supabase
              .from("external_contacts")
              .update(childPayload)
              .eq("id", mem.id);
            if (error) throw error;
            keepIds.add(mem.id);
          } else {
            sortBase += 1;
            const { data, error } = await supabase
              .from("external_contacts")
              .insert({ ...childPayload, sort: sortBase })
              .select("id")
              .single();
            if (error) throw error;
            keepIds.add(data.id);
          }
        }
        const existingKids = existingChildren;
        const toRemove = existingKids.filter((k) => !keepIds.has(k.id)).map((k) => k.id);
        if (toRemove.length) {
          const { error } = await supabase
            .from("external_contacts")
            .update({ deleted_at: new Date().toISOString() })
            .in("id", toRemove);
          if (error) throw error;
        }
      } else if (contact && isGroupKind(contact.kind)) {
        await softDeleteChildren(contact.id);
      }

      return saved;
    },
    onSuccess: async (c) => {
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: EXTERNAL_CONTACTS_KEY });
      if (c.customer_id && c.kind === "person" && !c.parent_id) {
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
        for (const mem of members) {
          if (!mem.full_name.trim()) continue;
          const memErr = validateExternalContact({
            full_name: mem.full_name,
            phone: joinMultiContacts(mem.phones) ?? "",
            email: joinMultiContacts(mem.emails) ?? "",
          });
          if (memErr) {
            toast.error(`${mem.full_name}: ${memErr}`);
            return;
          }
        }
        m.mutate();
      }}
    >
      <Field label="Тип" required>
        <Select
          value={v.kind}
          onValueChange={(kind) => {
            const next = kind as ExternalContactKind;
            setV((s) => ({ ...s, kind: next }));
            if (!isGroupKind(next)) setMembers([]);
            else if (members.length === 0) setMembers([emptyMember()]);
          }}
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
          {groupMode
            ? "Люди внутри группы наследуют заказчика."
            : "Человека с заказчиком можно выбрать на объекте как специалиста."}
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
      {!groupMode ? (
        <>
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
        </>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Люди в группе</p>
              <p className="text-[11px] text-muted-foreground">
                На этапе можно привязать всю группу сразу.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setMembers((s) => [...s, emptyMember()])}
            >
              <Plus className="size-3.5" />
              Контакт
            </Button>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока никого нет — добавьте контакты.</p>
          ) : (
            <ul className="space-y-3">
              {members.map((mem, idx) => (
                <li
                  key={mem.key}
                  className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Контакт {idx + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-danger"
                      title="Убрать"
                      onClick={() =>
                        setMembers((s) => s.filter((x) => x.key !== mem.key))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={mem.full_name}
                    onChange={(e) =>
                      setMembers((s) =>
                        s.map((x) =>
                          x.key === mem.key ? { ...x, full_name: e.target.value } : x,
                        ),
                      )
                    }
                    className={cls}
                    placeholder="ФИО"
                  />
                  <Input
                    value={mem.position}
                    onChange={(e) =>
                      setMembers((s) =>
                        s.map((x) =>
                          x.key === mem.key ? { ...x, position: e.target.value } : x,
                        ),
                      )
                    }
                    className={cls}
                    placeholder="Должность"
                    list="external-contact-positions"
                  />
                  <MultiValueInputs
                    values={mem.phones}
                    onChange={(phones) =>
                      setMembers((s) =>
                        s.map((x) => (x.key === mem.key ? { ...x, phones } : x)),
                      )
                    }
                    type="tel"
                    placeholder="Телефон"
                    addLabel="Ещё телефон"
                  />
                  <MultiValueInputs
                    values={mem.emails}
                    onChange={(emails) =>
                      setMembers((s) =>
                        s.map((x) => (x.key === mem.key ? { ...x, emails } : x)),
                      )
                    }
                    type="email"
                    placeholder="Почта"
                    addLabel="Ещё email"
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={mem.is_active}
                      onCheckedChange={(is_active) =>
                        setMembers((s) =>
                          s.map((x) => (x.key === mem.key ? { ...x, is_active } : x)),
                        )
                      }
                    />
                    Активен
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
              onDone={() => {
                if (isGroupKind(contact.kind)) {
                  void softDeleteChildren(contact.id).then(() => {
                    qc.invalidateQueries({ queryKey: EXTERNAL_CONTACTS_KEY });
                  });
                }
                onClose();
              }}
            />
          ) : undefined
        }
      />
    </form>
  );
}
