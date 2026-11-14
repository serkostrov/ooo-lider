import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "@/components/directories/common";
import type { RequestField } from "@/components/directories/request-types/data";
import { fieldLabelClass, fieldStackClass, panelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { FieldInput, isEmptyValue, isValidEmail, looksLikeEmailField } from "../FieldInput";
import { formatValue, type FieldValue } from "../data";

export type RequestFieldsHandle = {
  dirty: () => boolean;
  save: () => Promise<boolean>;
  reset: () => void;
  hasField: (fieldId: string) => boolean;
  getValue: (fieldId: string) => unknown;
};

function valuesMap(values: FieldValue[]) {
  return Object.fromEntries(values.map((v) => [v.field_id, v.value]));
}

function colSpan(t: string) {
  if (t === "textarea" || t === "picket_range") return "col-span-full";
  return "";
}

/**
 * Поля заявки одной группы (прораб или офис-менеджер).
 * readOnly задаёт страница по статусу; сохранение через ref (общий sticky-бар).
 */
export const RequestFieldsBlock = forwardRef<
  RequestFieldsHandle,
  {
    title: string;
    hint?: string;
    requestId: string;
    fields: RequestField[];
    values: FieldValue[];
    orphanValues: FieldValue[];
    readOnly: boolean;
    /** Обязательные для текущего перехода (сценарий шага ∪ is_required). */
    requiredFieldIds?: Set<string>;
    onDirtyChange?: (dirty: boolean) => void;
    /** Любое изменение черновика — чтобы страница пересчитала обязательные поля. */
    onDraftChange?: () => void;
  }
>(function RequestFieldsBlock(
  {
    title,
    hint,
    requestId,
    fields,
    values,
    orphanValues,
    readOnly,
    requiredFieldIds,
    onDirtyChange,
    onDraftChange,
  },
  ref,
) {
  const editable = fields.filter((f) => f.field_type !== "file");
  const initial = valuesMap(values);
  const [draft, setDraft] = useState<Record<string, unknown>>(initial);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const isDirty = () =>
    !readOnly &&
    editable.some(
      (f) =>
        JSON.stringify(draftRef.current[f.id] ?? null) !==
        JSON.stringify(initialRef.current[f.id] ?? null),
    );

  const dirty = isDirty();

  useEffect(() => {
    if (isDirty()) return;
    setDraft(valuesMap(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, readOnly]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    dirty: isDirty,
    reset: () => setDraft({ ...initialRef.current }),
    hasField: (fieldId) => editable.some((f) => f.id === fieldId),
    getValue: (fieldId) => draftRef.current[fieldId],
    save: async () => {
      if (readOnly || !isDirty()) return true;
      const cur = draftRef.current;
      const base = initialRef.current;
      for (const f of editable) {
        if (!looksLikeEmailField(f)) continue;
        const raw = cur[f.id];
        if (isEmptyValue(raw)) continue;
        if (typeof raw !== "string" || !isValidEmail(raw)) {
          const label = values.find((v) => v.field_id === f.id)?.label ?? f.label;
          throw new Error(`Некорректный email в поле «${label}»`);
        }
      }
      const p_values = editable
        .filter((f) => JSON.stringify(cur[f.id] ?? null) !== JSON.stringify(base[f.id] ?? null))
        .map((f) => ({ field_id: f.id, value: cur[f.id] ?? null }));
      if (p_values.length === 0) return true;
      const { error } = await supabase.rpc("request_save_values", {
        p_request_id: requestId,
        p_values: p_values as never,
      });
      if (error) throw error;
      // Сразу считаем сохранённым, не ждём refetch — иначе «Отправить» видит старый dirty/пусто.
      initialRef.current = { ...cur };
      setDraft({ ...cur });
      onDirtyChange?.(false);
      return true;
    },
  }));

  if (editable.length === 0 && orphanValues.length === 0) return null;

  const labelOf = (f: RequestField) => values.find((v) => v.field_id === f.id)?.label ?? f.label;
  const isReq = (f: RequestField) =>
    requiredFieldIds ? requiredFieldIds.has(f.id) : f.is_required;

  return (
    <section className={cn(panelClass, "p-5 sm:p-6")}>
      <header className="mb-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </header>

      {!readOnly ? (
        <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {editable.map((f) => (
            <div key={f.id} className={colSpan(f.field_type)}>
              <Field label={labelOf(f)} required={isReq(f)}>
                <FieldInput
                  field={f}
                  value={draft[f.id]}
                  onChange={(v) => {
                    const next = { ...draftRef.current, [f.id]: v };
                    draftRef.current = next;
                    setDraft(next);
                    onDraftChange?.();
                  }}
                />
              </Field>
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {editable.map((f) => {
            const v = initial[f.id];
            const empty = isEmptyValue(v);
            const req = isReq(f);
            return (
              <div key={f.id} className={cn(fieldStackClass, colSpan(f.field_type))}>
                <dt className={fieldLabelClass}>
                  {labelOf(f)}
                  {req && <span className="text-destructive"> *</span>}
                </dt>
                <dd className="whitespace-pre-line text-sm">
                  {empty ? (
                    <span className={req ? "text-warning" : "text-muted-foreground"}>
                      {req ? "Не заполнено" : "—"}
                    </span>
                  ) : (
                    formatValue(f.field_type, v)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {orphanValues.length > 0 && (
        <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-3">
          {orphanValues.map((v) => (
            <div key={v.field_id} className={fieldStackClass}>
              <dt className={fieldLabelClass}>{v.label} (поле больше не используется)</dt>
              <dd className="whitespace-pre-line text-sm">{formatValue(v.field_type, v.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
});
