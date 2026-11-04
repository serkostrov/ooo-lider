import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RequestField } from "@/components/directories/request-types/data";
import { formatPickets, parsePickets, picketLength, type Picket, type PicketRange } from "@/lib/pickets";
import { cn } from "@/lib/utils";

const EMPTY = "__empty";

const controlClass = "h-9 w-full text-sm";
const numberClass = cn(
  controlClass,
  "tabular-nums",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

/** Значение поля в форме: строка, число, дата ISO, bool. Файлы загружаются отдельно. */
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: RequestField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  switch (field.field_type) {
    case "number":
      return (
        <Input
          type="number"
          inputMode="decimal"
          disabled={disabled}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={numberClass}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={controlClass}
        />
      );
    case "select":
      return (
        <Select
          value={typeof value === "string" && value ? value : EMPTY}
          onValueChange={(v) => onChange(v === EMPTY ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className={controlClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY} className="text-sm">
              Не выбрано
            </SelectItem>
            {field.options.map((o) => (
              <SelectItem key={o} value={o} className="text-sm">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "textarea":
      return (
        <Textarea
          disabled={disabled}
          rows={3}
          value={typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[5.5rem] w-full resize-y text-sm"
        />
      );
    case "picket_range":
      return <PicketRangeInput value={value} onChange={onChange} disabled={disabled ?? false} />;
    case "checkbox":
      return (
        <label className="flex h-9 items-center gap-3 text-sm">
          <Checkbox
            className="size-4"
            disabled={disabled}
            checked={value === true}
            onCheckedChange={(c) => onChange(c === true)}
          />
          Да
        </label>
      );
    default:
      return (
        <Input
          disabled={disabled}
          value={typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={controlClass}
        />
      );
  }
}

/** Пустое ли значение (как в проверках request_create / request_set_status). */
export function isEmptyValue(v: unknown) {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

/**
 * Пикеты: два равных блока «От / До» + длина участка.
 * Наружу — строка «ПК 3+20 – ПК 4+60» (null, пока «от» пусто).
 */
function PicketRangeInput({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const parsed = parsePickets(value);
  const [r, setR] = useState<PicketRange>(parsed ?? { from: { pk: "", m: "" }, to: { pk: "", m: "" } });
  const legacy = parsed === null && typeof value === "string" ? value : null;
  const emitted = useRef<unknown>(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setR(parsePickets(value) ?? { from: { pk: "", m: "" }, to: { pk: "", m: "" } });
  }, [value]);

  const update = (side: "from" | "to", part: keyof Picket, raw: string) => {
    const clean =
      part === "pk"
        ? raw.replace(/\D/g, "").slice(0, 4)
        : raw.replace(",", ".").replace(/[^\d.]/g, "").slice(0, 5);
    const next = { ...r, [side]: { ...r[side], [part]: clean } };
    setR(next);
    emitted.current = formatPickets(next);
    onChange(emitted.current);
  };
  const len = picketLength(r);

  const cell = (side: "from" | "to", caption: string) => (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg bg-card/60 px-3 py-2.5 ring-1 ring-border/70">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{caption}</span>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">ПК</span>
        <Input
          inputMode="numeric"
          disabled={disabled}
          value={r[side].pk}
          onChange={(e) => update(side, "pk", e.target.value)}
          placeholder="0"
          aria-label={`${caption}: номер пикета`}
          className={cn(numberClass, "max-w-[5.5rem] flex-1 px-2 text-center")}
        />
        <span className="shrink-0 text-sm font-medium text-muted-foreground">+</span>
        <Input
          inputMode="decimal"
          disabled={disabled}
          value={r[side].m}
          onChange={(e) => update(side, "m", e.target.value)}
          placeholder="00"
          aria-label={`${caption}: метры`}
          className={cn(numberClass, "max-w-[5.5rem] flex-1 px-2 text-center")}
        />
        <span className="shrink-0 text-xs text-muted-foreground">м</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-stretch sm:gap-3 sm:p-3.5">
        {cell("from", "От")}
        <div className="hidden items-center justify-center sm:flex" aria-hidden>
          <ArrowRight className="size-4 text-muted-foreground/70" />
        </div>
        {cell("to", "До")}
        <div
          className={cn(
            "flex min-w-[6.5rem] flex-col items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-center",
            len === null
              ? "bg-muted/40 text-muted-foreground"
              : len < 0
                ? "bg-warning/15 text-warning"
                : "bg-card text-foreground ring-1 ring-border",
          )}
          title={len !== null && len < 0 ? "«До» меньше «от»" : undefined}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Участок
          </span>
          <span className="text-base font-semibold tabular-nums">
            {len === null ? "—" : len < 0 ? `−${Math.abs(len)} м` : `${len} м`}
          </span>
        </div>
      </div>
      {len !== null && len < 0 && (
        <p className="text-xs text-warning">«До» меньше «от» — проверьте пикеты</p>
      )}
      {!r.to.pk && r.from.pk && (
        <p className="text-xs text-muted-foreground">Одна точка: «до» можно не заполнять</p>
      )}
      {legacy && <p className="text-xs text-muted-foreground">Было записано: «{legacy}»</p>}
    </div>
  );
}
