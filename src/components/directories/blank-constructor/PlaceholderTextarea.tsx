import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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

export type PlaceholderSuggestion = {
  key: string;
  label: string;
  group: string;
};

type Suggestion = PlaceholderSuggestion;

function findOpenPlaceholder(value: string, caret: number): Match | null {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf("{{");
  if (open < 0) return null;
  const afterOpen = before.slice(open + 2);
  if (afterOpen.includes("}}") || afterOpen.includes("\n")) return null;
  return { start: open, query: afterOpen };
}

const DEFAULT_GROUPS: PlaceholderGroup[] = ["Поля заявки", "Объект"];
const HISTORY_MAX = 80;

export function PlaceholderTextarea({
  value,
  onChange,
  rows = 8,
  className,
  disabled,
  suggestions = PLACEHOLDER_SUGGESTIONS,
  groups,
  /** Своя история ⌘Z / ⌘⇧Z (controlled value ломает нативный undo). */
  undoable = false,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  className?: string;
  disabled?: boolean;
  suggestions?: readonly PlaceholderSuggestion[];
  /** Порядок групп в выпадающем списке; если не задан — из suggestions. */
  groups?: readonly string[];
  undoable?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [active, setActive] = useState(0);

  const historyRef = useRef<string[]>([value]);
  const histIndexRef = useRef(0);
  const applyingHistoryRef = useRef(false);

  // Внешний сброс (кнопка «стандартный текст») — перезапуск стека истории.
  useEffect(() => {
    if (!undoable || applyingHistoryRef.current) return;
    const cur = historyRef.current[histIndexRef.current];
    if (cur === value) return;
    historyRef.current = [value];
    histIndexRef.current = 0;
  }, [value, undoable]);

  const pushHistory = (next: string) => {
    if (!undoable || applyingHistoryRef.current) return;
    const cur = historyRef.current[histIndexRef.current];
    if (cur === next) return;
    const sliced = historyRef.current.slice(0, histIndexRef.current + 1);
    sliced.push(next);
    while (sliced.length > HISTORY_MAX) sliced.shift();
    historyRef.current = sliced;
    histIndexRef.current = sliced.length - 1;
  };

  const applyHistoryValue = (next: string) => {
    applyingHistoryRef.current = true;
    onChange(next);
    setMatch(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        const pos = next.length;
        el.setSelectionRange(pos, pos);
      }
      applyingHistoryRef.current = false;
    });
  };

  const undo = () => {
    if (!undoable || histIndexRef.current <= 0) return false;
    histIndexRef.current -= 1;
    applyHistoryValue(historyRef.current[histIndexRef.current]!);
    return true;
  };

  const redo = () => {
    if (!undoable || histIndexRef.current >= historyRef.current.length - 1) return false;
    histIndexRef.current += 1;
    applyHistoryValue(historyRef.current[histIndexRef.current]!);
    return true;
  };

  const groupOrder = useMemo(() => {
    if (groups?.length) return groups;
    if (suggestions === PLACEHOLDER_SUGGESTIONS) return DEFAULT_GROUPS;
    const seen: string[] = [];
    for (const s of suggestions) {
      if (!seen.includes(s.group)) seen.push(s.group);
    }
    return seen;
  }, [groups, suggestions]);

  const items = useMemo(() => {
    if (!match) return [] as Suggestion[];
    const q = match.query.trim().toLowerCase();
    return suggestions.filter(
      (s) =>
        !q ||
        s.key.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q),
    );
  }, [match, suggestions]);

  const flatIndex = (item: Suggestion) => items.findIndex((x) => x.key === item.key);

  const syncMatch = (nextValue: string, caret: number) => {
    const m = findOpenPlaceholder(nextValue, caret);
    setMatch(m);
    setActive(0);
  };

  const commit = (next: string) => {
    pushHistory(next);
    onChange(next);
  };

  const apply = (key: string) => {
    const el = ref.current;
    if (!el || !match) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, match.start);
    const after = value.slice(caret);
    const insert = `{{${key}}}`;
    const next = `${before}${insert}${after}`;
    commit(next);
    setMatch(null);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (undoable && (e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (key === "z") {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }
      if (key === "y" && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
    }

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
          commit(next);
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
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Вставка поля · ↑↓ Enter
            {undoable ? " · ⌘Z" : ""}
          </p>
          {groupOrder.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                        "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm",
                        i === active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        apply(item.key);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="min-w-0 truncate">
                        {item.label}
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {`{{${item.key}}}`}
                        </span>
                      </span>
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
