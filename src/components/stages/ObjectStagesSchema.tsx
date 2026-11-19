import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { ObjectStage } from "@/components/stages/data";

function tone(s: ObjectStage): string {
  if (s.is_excluded) return "border-muted bg-muted/40 text-muted-foreground";
  if (s.is_closed) return "border-success/40 bg-success-soft/50 text-success";
  if (s.is_overdue) return "border-danger/40 bg-danger-soft/50 text-danger";
  if (s.is_due_soon) return "border-warning/40 bg-warning-soft/50 text-warning";
  if (s.status_code === "on_review") return "border-primary/40 bg-primary/10 text-primary";
  return "border-border bg-card text-foreground";
}

function snakeCell(index: number, cols: number) {
  const row = Math.floor(index / cols);
  const pos = index % cols;
  const col = row % 2 === 0 ? pos : cols - 1 - pos;
  return { row, col };
}

function useSnakeCols(minColPx = 140) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(5);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = Math.max(2, Math.min(6, Math.floor(el.clientWidth / minColPx) || 2));
      setCols((prev) => (prev === next ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minColPx]);

  return { cols, ref } as const;
}

type Seg = { x1: number; y1: number; x2: number; y2: number };

function segsEqual(a: Seg[], b: Seg[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      Math.abs(x.x1 - y.x1) > 0.5 ||
      Math.abs(x.y1 - y.y1) > 0.5 ||
      Math.abs(x.x2 - y.x2) > 0.5 ||
      Math.abs(x.y2 - y.y2) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

/** Змейка топ-этапов на ровной сетке: вправо → вниз → влево → … */
export function ObjectStagesSchema({
  objectId,
  stages,
}: {
  objectId: string;
  stages: ObjectStage[];
}) {
  const tops = useMemo(
    () =>
      stages
        .filter((s) => !s.parent_id)
        .slice()
        .sort((a, b) => a.sort - b.sort || a.number - b.number),
    [stages],
  );

  const kidsByParent = useMemo(() => {
    const map = new Map<string, ObjectStage[]>();
    for (const s of stages) {
      if (!s.parent_id) continue;
      const list = map.get(s.parent_id) ?? [];
      list.push(s);
      map.set(s.parent_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort - b.sort || (a.code ?? "").localeCompare(b.code ?? "", "ru"));
    }
    return map;
  }, [stages]);

  const topKey = useMemo(() => tops.map((s) => s.id).join(","), [tops]);
  const topsRef = useRef(tops);
  topsRef.current = tops;

  const { cols, ref } = useSnakeCols();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const circleRefs = useRef(new Map<string, HTMLElement>());
  const [segs, setSegs] = useState<Seg[]>([]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const list = topsRef.current;
    if (!grid || list.length < 2) {
      setSegs((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    let raf = 0;
    const measure = () => {
      const current = topsRef.current;
      const gr = grid.getBoundingClientRect();
      const centers: { x: number; y: number; r: number }[] = [];
      for (const s of current) {
        const el = circleRefs.current.get(s.id);
        if (!el) {
          centers.push({ x: 0, y: 0, r: 24 });
          continue;
        }
        const box = el.getBoundingClientRect();
        centers.push({
          x: box.left + box.width / 2 - gr.left,
          y: box.top + box.height / 2 - gr.top,
          r: box.width / 2,
        });
      }
      const next: Seg[] = [];
      for (let i = 0; i < centers.length - 1; i++) {
        const a = centers[i]!;
        const b = centers[i + 1]!;
        const pa = snakeCell(i, cols);
        const pb = snakeCell(i + 1, cols);
        // линия до края круга, не через центр
        const gap = 1;
        if (pa.row === pb.row) {
          const left = a.x < b.x ? a : b;
          const right = a.x < b.x ? b : a;
          next.push({
            x1: left.x + left.r + gap,
            y1: a.y,
            x2: right.x - right.r - gap,
            y2: a.y,
          });
        } else {
          const top = a.y < b.y ? a : b;
          const bottom = a.y < b.y ? b : a;
          next.push({
            x1: a.x,
            y1: top.y + top.r + gap,
            x2: a.x,
            y2: bottom.y - bottom.r - gap,
          });
        }
      }
      setSegs((prev) => (segsEqual(prev, next) ? prev : next));
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(grid);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [topKey, cols]);

  if (tops.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Нет этапов для схемы</p>;
  }

  const rowCount = Math.ceil(tops.length / cols);

  return (
    <div
      ref={ref}
      className="rounded-xl border border-border/70 bg-card p-4 shadow-[var(--surface-glow)]"
    >
      <div className="mb-4 text-sm text-muted-foreground">
        Схема-змейка: нажмите номер — откроется карточка этапа
      </div>

      <div ref={gridRef} className="relative">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
        >
          {segs.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              className="stroke-border"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        <div
          className="relative z-10 grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rowCount}, auto)`,
            columnGap: "0.5rem",
            rowGap: "1.75rem",
          }}
        >
          {tops.map((s, index) => {
            const { row, col } = snakeCell(index, cols);
            const childStages = kidsByParent.get(s.id) ?? [];
            return (
              <div
                key={s.id}
                className="flex min-w-0 flex-col items-center px-1"
                style={{ gridColumn: col + 1, gridRow: row + 1 }}
              >
                <Link
                  ref={(el) => {
                    if (el) circleRefs.current.set(s.id, el);
                    else circleRefs.current.delete(s.id);
                  }}
                  to="/objects/$id/stages/$stageId"
                  params={{ id: objectId, stageId: s.id }}
                  title={`${s.code} ${s.name}`}
                  className={cn(
                    "relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 bg-card text-sm font-semibold tabular-nums transition-transform hover:scale-105",
                    tone(s),
                  )}
                >
                  {s.code || s.number}
                </Link>
                <div className="mt-2 flex min-h-[2.75rem] w-full flex-col items-center text-center">
                  <div className="line-clamp-2 w-full text-xs font-medium leading-snug text-foreground">
                    {s.name}
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {formatDate(s.due_date) || "без срока"}
                  </div>
                </div>
                <div className="mt-1 flex min-h-[1.125rem] flex-wrap justify-center gap-1">
                  {childStages.map((c) => (
                    <Link
                      key={c.id}
                      to="/objects/$id/stages/$stageId"
                      params={{ id: objectId, stageId: c.id }}
                      title={`${c.code} ${c.name}`}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        tone(c),
                      )}
                    >
                      {c.code}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
