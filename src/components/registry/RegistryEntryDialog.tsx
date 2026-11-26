import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomersShort } from "@/components/objects/data";
import { showError } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { RegistryFieldInput } from "./RegistryFieldInputs";
import {
  systemValue,
  useRegistryJournalFields,
  useRegistrySave,
  type RegistryEntry,
  type RegistryJournalField,
} from "./data";

const NONE = "__none__";
const ORPHAN = "__orphan__";

/** Сравнение с справочником: кавычки/регистр не должны ломать привязку. */
function counterpartyMatchKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[«»„“”"']/g, "")
    .replace(/\s+/g, " ");
}

function isCompactField(f: RegistryJournalField) {
  return (
    f.field_type === "date" ||
    f.field_type === "number" ||
    f.system_key === "in_letter_no"
  );
}

type FieldGroup =
  | { kind: "row"; fields: RegistryJournalField[] }
  | { kind: "block"; field: RegistryJournalField };

function groupRegistryFields(fields: RegistryJournalField[]): FieldGroup[] {
  const out: FieldGroup[] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i]!;
    if (isCompactField(f)) {
      const row: RegistryJournalField[] = [f];
      if (fields[i + 1] && isCompactField(fields[i + 1]!)) {
        row.push(fields[i + 1]!);
        i += 2;
      } else {
        i += 1;
      }
      out.push({ kind: "row", fields: row });
    } else {
      out.push({ kind: "block", field: f });
      i += 1;
    }
  }
  return out;
}

function FieldBlock({
  field,
  value,
  onChange,
  counterpartySelect,
}: {
  field: RegistryJournalField;
  value: string;
  onChange: (v: string) => void;
  counterpartySelect: {
    selectedCustomerId: string;
    counterparty: string;
    customers: { id: string; name: string }[];
    onPick: (id: string) => void;
  } | null;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">
        {field.label}
        {field.is_required ? " *" : ""}
      </span>
      {counterpartySelect ? (
        <Select value={counterpartySelect.selectedCustomerId} onValueChange={counterpartySelect.onPick}>
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue placeholder="Выберите из справочника" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-sm text-muted-foreground">
              Не указан
            </SelectItem>
            {counterpartySelect.selectedCustomerId === ORPHAN &&
            counterpartySelect.counterparty.trim() ? (
              <SelectItem value={ORPHAN} className="text-sm">
                {counterpartySelect.counterparty.trim()} (не из справочника)
              </SelectItem>
            ) : null}
            {counterpartySelect.customers.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <RegistryFieldInput field={field} value={value} onChange={onChange} />
      )}
    </label>
  );
}

export function RegistryEntryDialog({
  open,
  onOpenChange,
  journalId,
  entry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  journalId: string;
  entry: RegistryEntry | null;
}) {
  const save = useRegistrySave();
  const { data: fields = [] } = useRegistryJournalFields(journalId);
  const { data: customers = [] } = useCustomersShort();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const f of fields) {
      if (entry) next[f.id] = systemValue(entry, f);
      else if (f.system_key === "out_date") next[f.id] = mskToday();
      else next[f.id] = "";
    }
    setValues(next);
  }, [open, entry, fields]);

  const setField = (f: RegistryJournalField, v: string) => {
    setValues((prev) => ({ ...prev, [f.id]: v }));
  };

  const counterpartyField = fields.find((f) => f.system_key === "counterparty");
  const counterparty = counterpartyField ? values[counterpartyField.id] ?? "" : "";

  const selectedCustomerId = useMemo(() => {
    const name = counterparty.trim();
    if (!name) return NONE;
    const exact = customers.find((c) => c.name === name);
    if (exact) return exact.id;
    const key = counterpartyMatchKey(name);
    return customers.find((c) => counterpartyMatchKey(c.name) === key)?.id ?? ORPHAN;
  }, [counterparty, customers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {entry ? `Запись №${entry.number}` : "Новая запись реестра"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const byKey = (key: string) =>
              fields.find((f) => f.system_key === key)
                ? values[fields.find((f) => f.system_key === key)!.id] ?? ""
                : "";

            const outContent = byKey("out_content");
            const inContent = byKey("in_content");
            if (!outContent.trim() && !inContent.trim()) {
              toast.error("Укажите исходящее или входящее содержание");
              return;
            }
            for (const f of fields) {
              if (f.is_required && !(values[f.id] ?? "").trim()) {
                toast.error(`Заполните «${f.label}»`);
                return;
              }
            }

            const extra: Record<string, unknown> = {};
            for (const f of fields) {
              if (!f.system_key) extra[f.id] = values[f.id] ?? "";
            }

            save.mutate(
              {
                id: entry?.id ?? null,
                journal_id: journalId,
                counterparty: byKey("counterparty"),
                out_date: byKey("out_date") || null,
                out_content: outContent,
                in_date: byKey("in_date") || null,
                in_letter_no: byKey("in_letter_no"),
                in_content: inContent,
                object_id: entry?.object_id ?? null,
                extra,
              },
              {
                onSuccess: () => {
                  toast.success(entry ? "Сохранено" : "Добавлено");
                  onOpenChange(false);
                },
                onError: showError,
              },
            );
          }}
        >
          {groupRegistryFields(fields).map((group, gi) =>
            group.kind === "row" ? (
              <div key={`row-${gi}`} className="grid gap-3 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <FieldBlock
                    key={f.id}
                    field={f}
                    value={values[f.id] ?? ""}
                    onChange={(v) => setField(f, v)}
                    counterpartySelect={
                      f.system_key === "counterparty"
                        ? {
                            selectedCustomerId,
                            counterparty,
                            customers,
                            onPick: (id) => {
                              if (id === NONE) {
                                setField(f, "");
                                return;
                              }
                              if (id === ORPHAN) return;
                              const c = customers.find((x) => x.id === id);
                              if (c) setField(f, c.name);
                            },
                          }
                        : null
                    }
                  />
                ))}
              </div>
            ) : (
              <FieldBlock
                key={group.field.id}
                field={group.field}
                value={values[group.field.id] ?? ""}
                onChange={(v) => setField(group.field, v)}
                counterpartySelect={
                  group.field.system_key === "counterparty"
                    ? {
                        selectedCustomerId,
                        counterparty,
                        customers,
                        onPick: (id) => {
                          if (id === NONE) {
                            setField(group.field, "");
                            return;
                          }
                          if (id === ORPHAN) return;
                          const c = customers.find((x) => x.id === id);
                          if (c) setField(group.field, c.name);
                        },
                      }
                    : null
                }
              />
            ),
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={save.isPending} className="h-9 flex-1 text-sm">
              {save.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 flex-1 text-sm"
            >
              Отмена
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
