import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileSpreadsheet, Plus, Printer } from "lucide-react";
import { formatDate } from "@/lib/format";
import { mskToday } from "@/lib/dates";
import { exportXlsx, printTable, type Column } from "@/lib/export";
import { sortRows, useTableSort } from "@/lib/table-sort";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toolbar } from "@/components/directories/common";
import { SortableTh } from "@/components/SortableTh";
import { useRequestTypes } from "@/components/directories/request-types/data";
import { useObjects } from "@/components/objects/data";
import { NewRequestDialog } from "./NewRequestDialog";
import {
  useRequestStatuses,
  RequestStatusBadge,
  formatValue,
  overdueDays,
  sortRequests,
  statusInfo,
  useFieldValues,
  useRequests,
  type FieldValue,
  type RequestRow,
} from "./data";

const ALL = "__all";

type ReqSort =
  | "number"
  | "created"
  | "call"
  | "type"
  | "object"
  | "data"
  | "status"
  | "initiator"
  | "office";


type Filters = {
  object: string;
  type: string;
  status: string;
  from: string;
  to: string;
  onlyOpen: boolean;
  onlyOverdue: boolean;
  archive: boolean;
};

/** Ключевые поля для колонки: первые 3 непустых, кроме файлов. */
function keyFields(values: FieldValue[]) {
  return values
    .filter((v) => v.field_type !== "file" && formatValue(v.field_type, v.value) !== "")
    .slice(0, 3)
    .map((v) => `${v.label}: ${formatValue(v.field_type, v.value)}`);
}

export function RequestsList({
  objectId,
  typeId,
  onTypeChange,
}: {
  /** Если задан — список одного объекта (колонка и фильтр «Объект» скрыты). */
  objectId?: string;
  /** Контролируемый фильтр вида (URL на странице объекта). */
  typeId?: string | undefined;
  onTypeChange?: (typeId: string | undefined) => void;
}) {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useRequests(objectId);
  const { data: types = [] } = useRequestTypes();
  const statuses = useRequestStatuses();
  const { data: objects = [] } = useObjects();
  const ids = rows.map((r) => r.id);
  const { data: values = [] } = useFieldValues(ids, objectId ?? "all");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState<Filters>({
    object: ALL,
    type: ALL,
    status: ALL,
    from: "",
    to: "",
    onlyOpen: true,
    onlyOverdue: false,
    archive: false,
  });
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  /** Вид зафиксирован снаружи без колбэка (напр. роль снабжения). */
  const typeLocked = !!typeId && !onTypeChange;
  const typeSelect = onTypeChange ? (typeId ?? ALL) : typeLocked ? typeId! : f.type;
  const effectiveType = typeLocked ? typeId : typeSelect === ALL ? undefined : typeSelect;
  const setType = (v: string) => {
    if (onTypeChange) onTypeChange(v === ALL ? undefined : v);
    else set("type", v);
  };

  const valuesByRequest = useMemo(() => {
    const m: Record<string, FieldValue[]> = {};
    for (const v of values) (m[v.request_id] ??= []).push(v);
    return m;
  }, [values]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^№/, "");
    return rows.filter((r) => {
      if (f.object !== ALL && r.object_id !== f.object) return false;
      if (effectiveType && r.request_type_id !== effectiveType) return false;
      if (f.status !== ALL && r.status !== f.status) return false;
      if (f.from && r.call_date < f.from) return false;
      if (f.to && r.call_date > f.to) return false;
      if (f.archive) {
        if (r.status !== "done") return false;
      } else if (f.onlyOpen && r.status === "done") {
        return false;
      }
      if (f.onlyOverdue && !r.is_overdue) return false;
      if (q) {
        const hay = [
          String(r.number),
          r.type_name,
          r.object_name,
          r.representative_name,
          r.result_text,
          ...(valuesByRequest[r.id] ?? []).map((v) => formatValue(v.field_type, v.value)),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, f, effectiveType, search, valuesByRequest]);

  const { sort, toggle } = useTableSort<ReqSort>();
  const getters = useMemo(
    () =>
      ({
        number: (r: RequestRow) => r.number,
        created: (r: RequestRow) => r.created_at,
        call: (r: RequestRow) => r.call_date,
        type: (r: RequestRow) => r.type_name,
        object: (r: RequestRow) => r.object_name,
        data: (r: RequestRow) =>
          [...keyFields(valuesByRequest[r.id] ?? []), r.result_text ?? ""].join(" "),
        status: (r: RequestRow) => statusInfo(r.status, statuses).label,
        initiator: (r: RequestRow) => r.initiator_name,
        office: (r: RequestRow) => r.office_name,
      }) satisfies Record<ReqSort, (r: RequestRow) => unknown>,
    [valuesByRequest, statuses],
  );
  const sorted = useMemo(() => {
    if (!sort) return sortRequests(visible);
    return sortRows(visible, sort, getters);
  }, [visible, sort, getters]);

  const showObject = !objectId;

  const columns: Column<RequestRow>[] = [
    { header: "№", value: (r) => r.number, width: 7 },
    { header: "Дата формирования", value: (r) => formatDate(r.created_at), width: 12 },
    { header: "Дата вызова", value: (r) => formatDate(r.call_date), width: 12 },
    { header: "Вид", value: (r) => r.type_name, width: 18 },
    ...(showObject ? [{ header: "Объект", value: (r: RequestRow) => r.object_name, width: 35 }] : []),
    { header: "Кого вызываем", value: (r) => r.representative_name, width: 18 },
    { header: "Поля", value: (r) => keyFields(valuesByRequest[r.id] ?? []).join("; "), width: 40 },
    { header: "Статус", value: (r) => statusInfo(r.status, statuses).label + (r.is_overdue ? ` (не исполнена ${overdueDays(r)} дн.)` : ""), width: 22 },
    { header: "Результат", value: (r) => r.result_text, width: 20 },
    { header: "Инициатор", value: (r) => r.initiator_name, width: 20 },
    { header: "Офис-менеджер", value: (r) => r.office_name, width: 20 },
  ];

  return (
    <div>
      <NewRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        objectId={objectId}
        typeId={effectiveType}
      />
      <Toolbar search={search} onSearch={setSearch}>
        <Button
          onClick={() => setCreateOpen(true)}
          size="icon"
          title="Новая заявка"
          aria-label="Новая заявка"
        >
          <Plus className="size-4" />
        </Button>
      </Toolbar>

      <div className="mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
        {showObject && (
          <Select value={f.object} onValueChange={(v) => set("object", v)}>
            <SelectTrigger className="h-9 w-44 shrink-0 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-sm">Все объекты</SelectItem>
              {objects.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!typeLocked && (
          <Select value={typeSelect} onValueChange={setType}>
            <SelectTrigger className="h-9 w-36 shrink-0 text-sm">
              <SelectValue placeholder="Все виды" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-sm">Все виды</SelectItem>
              {types.filter((t) => t.is_active || t.id === typeSelect).map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-sm">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={f.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="h-9 w-36 shrink-0 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">Все статусы</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.v} value={s.v} className="text-sm">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex shrink-0 items-center gap-1.5 text-sm">
          с
          <Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} className="h-9 w-[9.5rem] text-sm" />
          по
          <Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} className="h-9 w-[9.5rem] text-sm" />
        </label>
        <label className="flex shrink-0 items-center gap-1.5 text-sm">
          <Switch
            checked={f.archive}
            onCheckedChange={(v) =>
              setF((x) => ({ ...x, archive: v, onlyOpen: v ? false : x.onlyOpen, onlyOverdue: v ? false : x.onlyOverdue }))
            }
          />
          Архив
        </label>
        {!f.archive && (
          <>
            <label className="flex shrink-0 items-center gap-1.5 text-sm">
              <Switch checked={f.onlyOpen} onCheckedChange={(v) => set("onlyOpen", v)} /> Незакрытые
            </label>
            <label className="flex shrink-0 items-center gap-1.5 text-sm">
              <Switch checked={f.onlyOverdue} onCheckedChange={(v) => set("onlyOverdue", v)} /> Просроченные
            </label>
          </>
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={sorted.length === 0}
            title="Выгрузить в Excel"
            aria-label="Выгрузить в Excel"
            onClick={() => exportXlsx(`Заявки — ${formatDate(mskToday())}`, "Заявки", columns, sorted)}
          >
            <FileSpreadsheet className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={sorted.length === 0}
            title="Печать"
            aria-label="Печать"
            onClick={() =>
              printTable(
                "Заявки",
                `Сформировано ${formatDate(mskToday())}. Заявок в списке: ${sorted.length}`,
                columns,
                sorted,
              )
            }
          >
            <Printer className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr>
              <SortableTh column="number" sort={sort} onToggle={toggle} className="w-28">№</SortableTh>
              <SortableTh column="created" sort={sort} onToggle={toggle}>Сформирована</SortableTh>
              <SortableTh column="call" sort={sort} onToggle={toggle}>Вызов на</SortableTh>
              <SortableTh column="type" sort={sort} onToggle={toggle}>Вид</SortableTh>
              {showObject && (
                <SortableTh column="object" sort={sort} onToggle={toggle}>Объект</SortableTh>
              )}
              <SortableTh column="data" sort={sort} onToggle={toggle}>Данные</SortableTh>
              <SortableTh column="status" sort={sort} onToggle={toggle}>Статус</SortableTh>
              <SortableTh column="initiator" sort={sort} onToggle={toggle}>Инициатор</SortableTh>
              <SortableTh column="office" sort={sort} onToggle={toggle}>Офис-менеджер</SortableTh>
            </tr>
          </thead>
          <tbody>
            {isLoading ? null : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "Заявок пока нет" : "Ничего не найдено"}
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const tone = r.is_overdue
                  ? "bg-danger-soft"
                  : r.status === "done"
                    ? "bg-success-soft/60"
                    : "";
                const dataLine = [
                  ...keyFields(valuesByRequest[r.id] ?? []),
                  ...(r.result_text ? [`Результат: ${r.result_text}`] : []),
                ].join(" · ");
                const typeLine = [r.type_name, r.representative_name].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={r.id}
                    onClick={() =>
                      navigate({
                        to: "/requests/$requestId",
                        params: { requestId: r.id },
                        search: objectId ? { from: "object" } : {},
                      })
                    }
                    className={`h-12 cursor-pointer border-t transition-colors hover:bg-elevated/50 ${tone}`}
                    title={[r.type_name, r.object_name, dataLine].filter(Boolean).join("\n")}
                  >
                    <td className="max-w-[7rem] px-5 py-2.5 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-semibold tabular-nums">{r.number}</span>
                        {r.is_new && (
                          <span className="shrink-0 rounded bg-danger px-1.5 py-0.5 text-[11px] font-semibold leading-none text-danger-foreground">
                            Новая
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle tabular-nums">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle">
                      <div className={`inline-flex items-center gap-1.5 tabular-nums ${r.is_overdue ? "text-danger" : ""}`}>
                        <span className="font-medium">{formatDate(r.call_date)}</span>
                        {r.is_overdue && (
                          <span
                            className="rounded-md bg-danger-soft px-1 py-0.5 text-[11px] font-semibold leading-none text-danger"
                            title={`Просрочено ${overdueDays(r)} дн.`}
                          >
                            −{overdueDays(r)}д
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[10rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={typeLine}>{typeLine}</div>
                    </td>
                    {showObject && (
                      <td className="max-w-[14rem] px-5 py-2.5 align-middle">
                        <div className="truncate" title={r.object_name ?? undefined}>{r.object_name}</div>
                      </td>
                    )}
                    <td className="max-w-[18rem] px-5 py-2.5 align-middle text-xs text-muted-foreground">
                      <div className="truncate" title={dataLine || undefined}>{dataLine || "—"}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 align-middle">
                      <RequestStatusBadge status={r.status} />
                    </td>
                    <td className="max-w-[9rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={r.initiator_name ?? undefined}>{r.initiator_name}</div>
                    </td>
                    <td className="max-w-[9rem] px-5 py-2.5 align-middle">
                      <div className="truncate" title={r.office_name ?? undefined}>{r.office_name}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
