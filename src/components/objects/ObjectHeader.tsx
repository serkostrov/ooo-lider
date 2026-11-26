import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  TONE_CLASS,
  contractDaysLeftLabel,
  contractTone,
  statusLabel,
  useObjectTypes,
  type ObjectRow,
} from "./data";
import { ObjectEmergencyBanner, ObjectEmergencyIcon } from "./ObjectEmergency";

/** Шапка объекта: сверху суть, детали — по раскрытию. На мобилке компактная. */
export function ObjectHeader({ o, actions }: { o: ObjectRow; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const daysLeft =
    o.status !== "completed" && o.contract_days_left !== null ? o.contract_days_left : null;

  return (
    <div
      className={cn(
        "rounded-md border bg-card",
        o.emergency ? "border-danger/50 shadow-[0_0_0_1px_oklch(0.55_0.2_25_/_0.25)]" : "border-border",
      )}
    >
      {o.emergency ? (
        <div className="hidden border-b border-danger/30 px-4 py-2.5 sm:block">
          <ObjectEmergencyBanner o={o} />
        </div>
      ) : null}

      <div className="flex items-start gap-2 px-2.5 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
          <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5">
            <div className="flex min-w-0 max-w-full items-start gap-1.5">
              <h1
                className="min-w-0 line-clamp-2 text-sm font-semibold leading-snug tracking-tight sm:line-clamp-none sm:text-lg"
                title={o.name}
              >
                {o.name}
              </h1>
              {o.emergency ? <ObjectEmergencyIcon className="mt-0.5" /> : null}
            </div>
            {o.status !== "in_work" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                {statusLabel(o.status)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <div
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] sm:h-7 sm:gap-1.5 sm:px-2 sm:text-xs",
                TONE_CLASS[tone] || "bg-muted/60",
              )}
              title={
                daysLeft != null
                  ? `${contractDaysLeftLabel(daysLeft)} · до ${formatDate(o.contract_end) || "—"}`
                  : undefined
              }
            >
              <span className="hidden opacity-80 sm:inline">До окончания</span>
              {daysLeft != null ? (
                <span className="font-semibold tabular-nums">
                  {daysLeft < 0 ? `−${-daysLeft}` : String(daysLeft)}
                  <span className="font-medium opacity-80"> дн.</span>
                </span>
              ) : (
                <span className="tabular-nums">{formatDate(o.contract_end) || "—"}</span>
              )}
              {daysLeft != null && o.contract_end ? (
                <span className="hidden tabular-nums opacity-70 sm:inline">
                  · {formatDate(o.contract_end)}
                </span>
              ) : null}
            </div>

            {o.stages_total > 0 && (
              <div className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md bg-muted/40 px-1.5 text-[11px] sm:h-7 sm:gap-2 sm:px-2 sm:text-xs">
                <div className="relative h-1 w-12 overflow-hidden rounded-full bg-muted sm:h-1.5 sm:w-28">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-success/85"
                    style={{ width: `${o.progress_pct}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground">
                  <span className="sm:hidden">{o.progress_pct}%</span>
                  <span className="hidden sm:inline">
                    {o.stages_closed}/{o.stages_total} · {o.progress_pct}%
                  </span>
                </span>
              </div>
            )}

            {o.responsible_name ? (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                Ответственный: <span className="text-foreground">{o.responsible_name}</span>
              </span>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-1.5 border-t border-border px-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:px-4"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        {open ? "Скрыть реквизиты" : "Реквизиты"}
        {!open && o.responsible_name ? (
          <span className="ml-auto truncate text-foreground/70 sm:hidden">{o.responsible_name}</span>
        ) : null}
      </button>

      {open && (
        <div className="grid gap-x-4 gap-y-2 border-t border-border px-3 py-2.5 text-sm sm:grid-cols-2 sm:px-4 sm:py-3 lg:grid-cols-3">
          {o.emergency && o.emergency_note ? (
            <div className="sm:col-span-2 lg:col-span-3 sm:hidden">
              <div className="text-[11px] font-medium uppercase tracking-wide text-danger">
                Нештатная ситуация
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-danger/90">{o.emergency_note}</p>
              {o.emergency_at ? (
                <p className="mt-0.5 text-xs text-danger/70">{formatDateTime(o.emergency_at)}</p>
              ) : null}
            </div>
          ) : null}
          <Field label="Адрес" value={o.address} />
          <Field label="Заказчик" value={o.customer_name} />
          <Field label="Тип" value={typeLabel(o.object_type)} />
          <Field label="Ответственный" value={o.responsible_name} />
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
          {o.status !== "completed" && o.contract_days_left !== null ? (
            <Field label="До окончания объекта" value={contractDaysLeftLabel(o.contract_days_left)} />
          ) : null}
          {o.actual_work_start ? (
            <Field label="Фактическая дата начала работ" value={formatDate(o.actual_work_start)} />
          ) : null}
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
