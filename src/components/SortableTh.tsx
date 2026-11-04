import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { thClass } from "@/lib/ui";
import type { SortDir, SortState } from "@/lib/table-sort";
import { TableHead } from "@/components/ui/table";

type Props<K extends string> = {
  column: K;
  sort: SortState<K> | null;
  onToggle: (key: K) => void;
  children: ReactNode;
  className?: string;
  /** raw — обычный <th>; table — shadcn TableHead */
  as?: "th" | "table";
};

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir | undefined }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-35" aria-hidden />;
  if (dir === "asc") return <ArrowUp className="size-3 text-signal" aria-hidden />;
  return <ArrowDown className="size-3 text-signal" aria-hidden />;
}

/** Заголовок колонки с сортировкой по клику (возр. → убыв. → сброс). */
export function SortableTh<K extends string>({
  column,
  sort,
  onToggle,
  children,
  className,
  as = "th",
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
        "inline-flex h-full min-h-10 items-center gap-1.5 whitespace-nowrap text-left transition-colors hover:text-foreground",
        active && "text-foreground",
      )}
      title={label}
      aria-label={`${typeof children === "string" ? children : "Колонка"}: ${label}`}
    >
      <span>{children}</span>
      <SortIcon active={active} dir={dir} />
    </button>
  );

  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";

  if (as === "table") {
    return (
      <TableHead className={className} aria-sort={ariaSort}>
        {inner}
      </TableHead>
    );
  }

  return (
    <th className={cn(thClass, className)} aria-sort={ariaSort}>
      {inner}
    </th>
  );
}
