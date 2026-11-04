import type { ReactNode } from "react";
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

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm text-foreground" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
    </div>
  );
}

/** Шапка объекта (ТЗ 7.4): название, реквизиты, срок по договору с подсветкой. */
export function ObjectHeader({ o, actions }: { o: ObjectRow; actions?: ReactNode }) {
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const days =
    o.status !== "completed" && o.contract_days_left !== null ? daysLeftText(o.contract_days_left) : null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/10 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold leading-snug tracking-tight">{o.name}</h1>
            {o.status !== "in_work" && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {statusLabel(o.status)}
              </span>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-stretch lg:gap-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
          <MetaItem label="Адрес" value={o.address} />
          <MetaItem label="Заказчик" value={o.customer_name} />
          <MetaItem label="Тип" value={typeLabel(o.object_type)} />
          <MetaItem label="Ответственный" value={o.responsible_name} />
          <MetaItem label="Куратор" value={o.curator_name} />
          <MetaItem label="Технадзор" value={o.technadzor_name} />
          <MetaItem label="Технадзор ЭХЗ" value={o.technadzor_ehz_name} />
          {o.current_stage_number != null && (
            <MetaItem
              label="Текущий этап"
              value={`${o.current_stage_number}. ${o.current_stage_name ?? ""}`}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <div
            className={cn(
              "rounded-xl px-3.5 py-3",
              TONE_CLASS[tone] || "bg-muted/60",
            )}
          >
            <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">Срок по договору</div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="tabular-nums">
                {formatDate(o.contract_start) || "—"} – {formatDate(o.contract_end) || "—"}
              </span>
              {days && <span className="font-semibold tabular-nums">{days}</span>}
            </div>
          </div>

          {o.stages_total > 0 && (
            <div className="rounded-xl bg-muted/40 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Готовность</span>
                <span className="tabular-nums text-foreground">
                  {o.stages_closed}/{o.stages_total}
                </span>
              </div>
              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-success/85 transition-[width]"
                  style={{ width: `${o.progress_pct}%` }}
                />
              </div>
              <div className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">{o.progress_pct}%</div>
            </div>
          )}
        </aside>
      </div>

      {o.notes && (
        <p className="mt-4 border-t border-border pt-3 whitespace-pre-line text-sm text-muted-foreground">{o.notes}</p>
      )}
    </div>
  );
}
