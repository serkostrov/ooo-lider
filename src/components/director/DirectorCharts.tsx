import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AttentionSlice,
  ExecutorLoad,
  ObjectProgress,
  WorkTypeReadiness,
} from "@/components/director/data";

const ALL_ROLES = "__all";

const readinessConfig = {
  closed: { label: "Закрыто", color: "var(--chart-2)" },
  open: { label: "Открыто", color: "var(--chart-1)" },
} satisfies ChartConfig;

const loadConfig = {
  openCount: { label: "Открытых этапов", color: "var(--chart-3)" },
} satisfies ChartConfig;

const progressConfig = {
  progressPct: { label: "Готовность", color: "var(--chart-1)" },
} satisfies ChartConfig;

const attentionConfig = {
  value: { label: "Проблемы" },
} satisfies ChartConfig;

const AXIS_TICK = { fontSize: 13 } as const;
const OBJECT_LABEL_W = 220;
/** Одинаковая высота всех карточек графиков. */
const PANEL_H = "h-[28rem]";

function chartBodyHeight(rows: number, rowPx: number, base = 48, min = 160) {
  return Math.max(min, base + Math.max(rows, 1) * rowPx);
}

/**
 * Фиксированная область: мало данных — график по центру,
 * много — вертикальный скролл внутри карточки.
 */
function ScrollableChart({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="flex min-h-full flex-col justify-center">
        <div className="w-full shrink-0" style={{ height }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Двухстрочная подпись оси — длинные названия объектов не обрезаются в одноточие. */
function WrappedYTick({
  x = 0,
  y = 0,
  payload,
  width = OBJECT_LABEL_W,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  width?: number;
}) {
  const label = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-width + 4} y={-20} width={width - 10} height={40}>
        <div
          title={label}
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            textAlign: "right",
            fontSize: 13,
            lineHeight: 1.25,
            color: "var(--muted-foreground)",
            wordBreak: "break-word",
          }}
        >
          {label}
        </div>
      </foreignObject>
    </g>
  );
}

function ChartPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex ${PANEL_H} flex-col rounded-xl border border-border/70 bg-card p-5 shadow-[var(--surface-glow)] ${className ?? ""}`}
    >
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden text-sm">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex h-full items-center justify-center text-base text-muted-foreground">
      {text}
    </p>
  );
}

/** Легенда под графиком — всегда внизу карточки, не скроллится. */
function FixedChartLegend({
  items,
}: {
  items: { key: string; label: string; color: string }[];
}) {
  return (
    <ul className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: it.color }}
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function DirectorCharts({
  workTypeReadiness,
  executorLoad,
  objectProgress,
  attentionMix,
  loading,
  onSelectObject,
}: {
  workTypeReadiness: WorkTypeReadiness[] | undefined;
  executorLoad: ExecutorLoad[] | undefined;
  objectProgress: ObjectProgress[] | undefined;
  attentionMix: AttentionSlice[] | undefined;
  loading: boolean;
  onSelectObject?: (objectId: string) => void;
}) {
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);

  const roleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of executorLoad ?? []) {
      if (!row.roleCode) continue;
      map.set(row.roleCode, row.roleName?.trim() || row.roleCode);
    }
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [executorLoad]);

  const load = useMemo(() => {
    const all = executorLoad ?? [];
    return roleFilter === ALL_ROLES ? all : all.filter((r) => r.roleCode === roleFilter);
  }, [executorLoad, roleFilter]);

  if (loading && !workTypeReadiness) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className={`${PANEL_H} rounded-xl`} />
        ))}
      </div>
    );
  }

  const readiness = workTypeReadiness ?? [];
  const objects = objectProgress ?? [];
  const attention = attentionMix ?? [];
  const attentionTotal = attention.reduce((s, a) => s + a.value, 0);

  const loadChartH = chartBodyHeight(load.length, 34);
  const readinessH = chartBodyHeight(readiness.length, 36);
  const objectsH = chartBodyHeight(objects.length, 44, 56, 180);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartPanel
        title="Готовность по группам"
        description="Закрытые и открытые этапы — сначала самые отстающие группы"
      >
        {readiness.length === 0 ? (
          <Empty text="Нет этапов" />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <ScrollableChart height={readinessH}>
                <ChartContainer
                  config={readinessConfig}
                  className="aspect-auto h-full w-full text-sm [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground"
                >
                  <BarChart
                    data={readiness}
                    layout="vertical"
                    margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                    barCategoryGap={10}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <YAxis
                      dataKey="shortLabel"
                      type="category"
                      width={140}
                      tickLine={false}
                      axisLine={false}
                      tick={AXIS_TICK}
                      interval={0}
                    />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={AXIS_TICK}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as WorkTypeReadiness | undefined;
                            return row ? `${row.workType} · ${row.pct}%` : "";
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="closed"
                      stackId="a"
                      fill="var(--color-closed)"
                      radius={[0, 0, 0, 0]}
                      maxBarSize={18}
                    />
                    <Bar
                      dataKey="open"
                      stackId="a"
                      fill="var(--color-open)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                    />
                  </BarChart>
                </ChartContainer>
              </ScrollableChart>
            </div>
            <FixedChartLegend
              items={[
                { key: "closed", label: "Закрыто", color: "var(--chart-2)" },
                { key: "open", label: "Открыто", color: "var(--chart-1)" },
              ]}
            />
          </div>
        )}
      </ChartPanel>

      <ChartPanel
        title="Нагрузка исполнителей"
        description="Открытые этапы с назначением, по убыванию"
        actions={
          roleOptions.length > 0 ? (
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-[min(100%,11.5rem)] text-sm" aria-label="Роль">
                <SelectValue placeholder="Все роли" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES} className="text-sm">
                  Все роли
                </SelectItem>
                {roleOptions.map((r) => (
                  <SelectItem key={r.code} value={r.code} className="text-sm">
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      >
        {load.length === 0 ? (
          <Empty text={roleFilter === ALL_ROLES ? "Нет назначений" : "Нет исполнителей по роли"} />
        ) : (
          <ScrollableChart height={loadChartH}>
            <ChartContainer config={loadConfig} className="aspect-auto h-full w-full text-sm">
              <BarChart
                data={load}
                layout="vertical"
                margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                barCategoryGap={8}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <YAxis
                  dataKey="shortName"
                  type="category"
                  width={112}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  interval={0}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as ExecutorLoad | undefined;
                        if (!row) return "";
                        return row.roleName ? `${row.name} · ${row.roleName}` : row.name;
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="openCount"
                  fill="var(--color-openCount)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ChartContainer>
          </ScrollableChart>
        )}
      </ChartPanel>

      <ChartPanel
        title="Готовность объектов"
        description="Активные объекты, сначала с меньшей готовностью. Клик — статистика и трасса выше."
      >
        {objects.length === 0 ? (
          <Empty text="Нет объектов" />
        ) : (
          <ScrollableChart height={objectsH}>
            <ChartContainer config={progressConfig} className="aspect-auto h-full w-full text-sm">
              <BarChart
                data={objects}
                layout="vertical"
                margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
                barCategoryGap={10}
                {...(onSelectObject
                  ? {
                      className: "cursor-pointer",
                      onClick: (state: { activePayload?: Array<{ payload?: ObjectProgress }> }) => {
                        const row = state?.activePayload?.[0]?.payload;
                        if (row?.id) onSelectObject(row.id);
                      },
                    }
                  : {})}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={OBJECT_LABEL_W}
                  tickLine={false}
                  axisLine={false}
                  tick={<WrappedYTick width={OBJECT_LABEL_W} />}
                  interval={0}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const row = item.payload as ObjectProgress;
                        const overdue = row.stagesOverdue + row.requestsOverdue;
                        return (
                          <span className="tabular-nums">
                            {String(value)}%
                            {overdue > 0 ? ` · просрочек ${overdue}` : ""}
                          </span>
                        );
                      }}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as ObjectProgress | undefined;
                        return row?.name ?? "";
                      }}
                    />
                  }
                />
                <Bar dataKey="progressPct" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {objects.map((o) => (
                    <Cell
                      key={o.id}
                      fill={
                        o.progressPct < 30
                          ? "var(--danger)"
                          : o.progressPct < 60
                            ? "var(--warning)"
                            : "var(--chart-2)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ScrollableChart>
        )}
      </ChartPanel>

      <ChartPanel
        title="Состав проблем"
        description="Сколько сигналов внимания по активным объектам и какая доля у каждого типа."
      >
        {attention.length === 0 ? (
          <Empty text="Критических сигналов нет" />
        ) : (
          <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <div className="flex min-h-full flex-col justify-center gap-4 sm:flex-row sm:items-center">
              <div className="mx-auto flex w-full max-w-[220px] shrink-0 flex-col items-center">
                <ChartContainer
                  config={attentionConfig}
                  className="aspect-square w-full text-sm"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          hideLabel
                          nameKey="label"
                          formatter={(value, _name, item) => {
                            const row = item.payload as AttentionSlice;
                            const pct =
                              attentionTotal > 0
                                ? Math.round((100 * Number(value)) / attentionTotal)
                                : 0;
                            return (
                              <div className="max-w-[220px] space-y-0.5">
                                <div className="text-sm font-medium">{row.label}</div>
                                <div className="text-xs text-muted-foreground">{row.hint}</div>
                                <div className="text-sm tabular-nums">
                                  {String(value)} · {pct}%
                                </div>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Pie
                      data={attention}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={58}
                      outerRadius={90}
                      strokeWidth={2}
                      stroke="var(--card)"
                    >
                      {attention.map((s) => (
                        <Cell key={s.key} fill={s.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) - 6}
                                className="fill-foreground font-[family-name:var(--font-display)] text-3xl font-semibold"
                              >
                                {attentionTotal}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) + 16}
                                className="fill-muted-foreground text-sm"
                              >
                                сигналов
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-3">
                {attention.map((s) => {
                  const pct =
                    attentionTotal > 0 ? Math.round((100 * s.value) / attentionTotal) : 0;
                  return (
                    <li key={s.key} className="flex items-start gap-3">
                      <span
                        className="mt-1.5 size-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: s.fill }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold text-foreground">{s.label}</span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            <span className="font-semibold text-foreground">{s.value}</span>
                            <span className="mx-1.5 text-border">·</span>
                            {pct}%
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.hint}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </ChartPanel>
    </div>
  );
}
