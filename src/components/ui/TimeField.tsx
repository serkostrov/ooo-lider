import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

/** «12:00» / «12-00» / «9:30» → «HH:MM»; иначе как есть. */
export function normalizeTimeValue(raw: string): string {
  const t = raw.trim().replace(/\./g, ":").replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})[:\-](\d{2})$/);
  if (!m) return raw.trim();
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return raw.trim();
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseHm(v: string): { h: number; m: number } | null {
  const n = normalizeTimeValue(v);
  const match = n.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-3 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ScrollArea className="h-52 w-[4.5rem]">
        <div className="flex flex-col gap-0.5 p-1.5">
          {values.map((n) => {
            const active = selected === n;
            return (
              <button
                key={n}
                type="button"
                ref={active ? activeRef : undefined}
                onClick={() => onSelect(n)}
                className={cn(
                  "h-8 rounded-md text-sm tabular-nums transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {pad(n)}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Поле времени как DateField: кнопка + Popover (Radix), без нативного type=time.
 * Значение — «HH:MM» (для бланка технадзора нормализуется в «HH-MM»).
 */
export function TimeField({
  value,
  onChange,
  className,
  disabled,
  placeholder = "чч:мм",
  clearable = true,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (hm: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseHm(value);
  const [draftH, setDraftH] = useState<number>(parsed?.h ?? 9);
  const [draftM, setDraftM] = useState<number>(parsed?.m ?? 0);

  useEffect(() => {
    if (!open) return;
    setDraftH(parsed?.h ?? 9);
    setDraftM(parsed?.m ?? 0);
  }, [open, parsed?.h, parsed?.m]);

  const apply = (h: number, m: number) => {
    onChange(`${pad(h)}:${pad(m)}`);
  };

  const display = parsed ? `${pad(parsed.h)}:${pad(parsed.m)}` : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-9 w-[11.5rem] max-w-full justify-start gap-2 px-2.5 text-left text-sm font-normal tabular-nums",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="size-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{display || placeholder}</span>
          {clearable && display && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Очистить время"
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
      <PopoverContent className="z-[60] w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          <TimeColumn
            label="Часы"
            values={HOURS}
            selected={draftH}
            onSelect={(h) => {
              setDraftH(h);
              apply(h, draftM);
            }}
          />
          <TimeColumn
            label="Минуты"
            values={MINUTES}
            selected={draftM}
            onSelect={(m) => {
              setDraftM(m);
              apply(draftH, m);
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
