import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PLACEHOLDER_SUGGESTIONS,
  type PlaceholderGroup,
} from "./types";

type Match = {
  start: number;
  query: string;
};

type Suggestion = (typeof PLACEHOLDER_SUGGESTIONS)[number];

function findOpenPlaceholder(value: string, caret: number): Match | null {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf("{{");
  if (open < 0) return null;
  const afterOpen = before.slice(open + 2);
  if (afterOpen.includes("}}") || afterOpen.includes("\n")) return null;
  return { start: open, query: afterOpen };
}

const GROUPS: PlaceholderGroup[] = ["Поля заявки", "Объект"];

export function PlaceholderTextarea({
  value,
  onChange,
  rows = 8,
  className,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    if (!match) return [] as Suggestion[];
    const q = match.query.trim().toLowerCase();
    return PLACEHOLDER_SUGGESTIONS.filter(
      (s) =>
        !q ||
        s.key.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q),
    );
  }, [match]);

  const flatIndex = (item: Suggestion) => items.findIndex((x) => x.key === item.key);

  const syncMatch = (nextValue: string, caret: number) => {
    const m = findOpenPlaceholder(nextValue, caret);
    setMatch(m);
    setActive(0);
  };

  const apply = (key: string) => {
    const el = ref.current;
    if (!el || !match) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, match.start);
    const after = value.slice(caret);
    const insert = `{{${key}}}`;
    const next = `${before}${insert}${after}`;
    onChange(next);
    setMatch(null);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!match || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const item = items[active];
      if (item) apply(item.key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMatch(null);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        disabled={disabled}
        className={cn("font-mono text-sm", className)}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          syncMatch(next, e.target.selectionStart ?? next.length);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          const el = e.currentTarget;
          syncMatch(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            const el = e.currentTarget;
            syncMatch(el.value, el.selectionStart ?? el.value.length);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setMatch(null), 150);
        }}
      />
      {match && items.length > 0 && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-md border border-neutral-200 bg-white p-1 text-neutral-900 shadow-lg"
          role="listbox"
        >
          <p className="px-2 py-1 text-[11px] text-neutral-500">
            Вставка поля · ↑↓ Enter
          </p>
          {GROUPS.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {group}
                </p>
                {groupItems.map((item) => {
                  const i = flatIndex(item);
                  return (
                    <button
                      key={`${item.group}:${item.key}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={cn(
                        "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-neutral-900",
                        i === active
                          ? "bg-sky-100 text-sky-950"
                          : "hover:bg-neutral-100",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        apply(item.key);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
