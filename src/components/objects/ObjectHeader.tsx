import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  TONE_CLASS,
  contractTone,
  daysLeftText,
  statusLabel,
  useObjectTypes,
  type ObjectRow,
} from "./data";

/** Шапка объекта: сверху суть, детали — по раскрытию. */
export function ObjectHeader({ o, actions }: { o: ObjectRow; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const days =
    o.status !== "completed" && o.contract_days_left !== null ? daysLeftText(o.contract_days_left) : null;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h1 className="text-lg font-semibold leading-snug tracking-tight">{o.name}</h1>
            {o.status !== "in_work" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {statusLabel(o.status)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs",
                TONE_CLASS[tone] || "bg-muted/60",
              )}
            >
              <span className="opacity-80">Договор</span>
              <span className="tabular-nums">
                {formatDate(o.contract_end) || "—"}
              </span>
              {days && <span className="font-semibold tabular-nums">{days}</span>}
            </div>

            {o.stages_total > 0 && (
              <div className="inline-flex h-7 items-center gap-2 rounded-md bg-muted/40 px-2 text-xs">
                <span className="text-muted-foreground">Готовность</span>
                <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:w-28">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-success/85"
                    style={{ width: `${o.progress_pct}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {o.stages_closed}/{o.stages_total} · {o.progress_pct}%
                </span>
              </div>
            )}

            {o.responsible_name && (
              <span className="text-xs text-muted-foreground">
                Ответственный: <span className="text-foreground">{o.responsible_name}</span>
              </span>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {open ? "Скрыть реквизиты" : "Реквизиты объекта"}
      </button>

      {open && (
        <div className="grid gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Адрес" value={o.address} />
          <Field label="Заказчик" value={o.customer_name} />
          <Field label="Тип" value={typeLabel(o.object_type)} />
          <Field label="Куратор" value={o.curator_name} />
          <Field label="Технадзор" value={o.technadzor_name} />
          <Field label="Технадзор ЭХЗ" value={o.technadzor_ehz_name} />
          {o.current_stage_number != null && (
            <Field
              label="Текущий этап"
              value={`${o.current_stage_number}. ${o.current_stage_name ?? ""}`}
            />
          )}
          <Field
            label="Срок договора"
            value={`${formatDate(o.contract_start) || "—"} – ${formatDate(o.contract_end) || "—"}`}
          />
          {o.notes && (
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Примечание
              </div>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{o.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-foreground" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
    </div>
  );
}
