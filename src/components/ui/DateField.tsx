import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parseYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Компактное поле даты: без нативного type=date и его «хвоста» на всю ширину.
 * Значение — YYYY-MM-DD (как в БД).
 */
export function DateField({
  value,
  onChange,
  className,
  disabled,
  placeholder = "дд.мм.гггг",
  clearable = true,
}: {
  value: string;
  onChange: (ymd: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-[11.5rem] justify-start gap-2 px-2.5 text-left text-sm font-normal tabular-nums",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{value ? formatDate(value) : placeholder}</span>
          {clearable && value && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Очистить дату"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          {...(selected ? { defaultMonth: selected } : {})}
          captionLayout="dropdown"
          onSelect={(d) => {
            onChange(d ? toYmd(d) : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
