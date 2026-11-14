import { useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { thClass } from "@/lib/ui";
import { clampColumnWidth } from "@/lib/table-column-widths";
import type { SortDir, SortState } from "@/lib/table-sort";
import { TableHead } from "@/components/ui/table";

export type ThResizeProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onReset?: () => void;
};

type Props<K extends string> = {
  column: K;
  sort: SortState<K> | null;
  onToggle: (key: K) => void;
  children: ReactNode;
  className?: string;
  /** raw — обычный <th>; table — shadcn TableHead */
  as?: "th" | "table";
  /** Ресайз как в Excel: тянуть край, двойной клик — сброс. */
  resize?: ThResizeProps;
};

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir | undefined }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-35" aria-hidden />;
  if (dir === "asc") return <ArrowUp className="size-3 text-signal" aria-hidden />;
  return <ArrowDown className="size-3 text-signal" aria-hidden />;
}

function ColumnResizeHandle({ resize }: { resize: ThResizeProps }) {
  const dragging = useRef(false);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину колонки"
      title="Тяните, чтобы изменить ширину · двойной клик — по умолчанию"
      className={cn(
        "absolute -right-1 top-0 z-20 flex h-full w-2 cursor-col-resize touch-none items-stretch justify-center",
        "after:my-2 after:w-px after:bg-border after:transition-colors",
        "hover:after:bg-primary/70 active:after:bg-primary",
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        resize.onReset?.();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging.current = true;
        const startX = e.clientX;
        const startW = resize.width;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);

        const onMove = (ev: PointerEvent) => {
          if (!dragging.current) return;
          const next = clampColumnWidth(startW + (ev.clientX - startX), resize.minWidth, resize.maxWidth);
          resize.onResize(next);
        };
        const onUp = (ev: PointerEvent) => {
          dragging.current = false;
          target.releasePointerCapture(ev.pointerId);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          const next = clampColumnWidth(startW + (ev.clientX - startX), resize.minWidth, resize.maxWidth);
          resize.onResizeEnd(next);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
    />
  );
}

/** Заголовок колонки с сортировкой по клику (возр. → убыв. → сброс). */
export function SortableTh<K extends string>({
  column,
  sort,
  onToggle,
  children,
  className,
  as = "th",
  resize,
}: Props<K>) {
  const active = sort?.key === column;
  const dir = active ? sort.dir : undefined;
  const label =
    active && dir === "asc" ? "Сортировка по возрастанию" : active && dir === "desc" ? "Сортировка по убыванию" : "Сортировать";

  const inner = (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        "inline-flex h-full min-h-10 max-w-full items-center gap-1.5 truncate text-left transition-colors hover:text-foreground",
        active && "text-foreground",
      )}
      title={label}
      aria-label={`${typeof children === "string" ? children : "Колонка"}: ${label}`}
    >
      <span className="truncate">{children}</span>
      <SortIcon active={active} dir={dir} />
    </button>
  );

  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  const shellClass = cn("relative overflow-hidden pr-2", className);

  if (as === "table") {
    return (
      <TableHead className={shellClass} aria-sort={ariaSort}>
        {inner}
        {resize ? <ColumnResizeHandle resize={resize} /> : null}
      </TableHead>
    );
  }

  return (
    <th className={cn(thClass, shellClass)} aria-sort={ariaSort}>
      {inner}
      {resize ? <ColumnResizeHandle resize={resize} /> : null}
    </th>
  );
}
