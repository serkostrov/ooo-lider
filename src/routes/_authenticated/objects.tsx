import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { formatDate } from "@/lib/format";
import { useSortedRows, useTableSort } from "@/lib/table-sort";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toolbar, matches } from "@/components/directories/common";
import { PageHeader } from "@/components/PageHeader";
import { SortableTh } from "@/components/SortableTh";
import {
  OBJECT_STATUSES,
  contractTone,
  daysLeftText,
  statusLabel,
  useObjectTypes,
  useObjects,
  type ObjectRow,
} from "@/components/objects/data";

type ObjSort =
  | "name"
  | "address"
  | "customer"
  | "type"
  | "responsible"
  | "progress"
  | "contract";

const OBJ_GETTERS: Record<ObjSort, (o: ObjectRow) => unknown> = {
  name: (o) => o.name,
  address: (o) => o.address,
  customer: (o) => o.customer_name,
  type: (o) => o.object_type,
  responsible: (o) => o.responsible_name,
  progress: (o) => o.progress_pct,
  contract: (o) => o.contract_end,
};

export const Route = createFileRoute("/_authenticated/objects")({
  component: ObjectsPage,
  head: () => ({
    meta: [
      { title: "Объекты — Лидер" },
      { name: "description", content: "Объекты в системе «Лидер»" },
    ],
  }),
});

function ObjectsPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const { data: objects = [], isLoading } = useObjects();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const { all: objectTypes } = useObjectTypes();
  const typeOptions = objectTypes.filter(
    (t) => !t.deleted_at || objects.some((o) => o.object_type === t.code),
  );
  const [archive, setArchive] = useState(false);

  const scope = useMemo(
    () => objects.filter((o) => (archive ? o.status === "completed" : o.status !== "completed")),
    [objects, archive],
  );

  const filtered = scope.filter(
    (o) =>
      matches(search, o.name, o.address) &&
      (status === "all" || o.status === status) &&
      (type === "all" || o.object_type === type),
  );
  const { sort, toggle } = useTableSort<ObjSort>();
  const rows = useSortedRows(filtered, sort, OBJ_GETTERS);

  return (
    <div>
      <PageHeader
        title={archive ? "Архив объектов" : "Объекты"}
        description={
          archive ? "Завершённые объекты в архиве" : "Список всех активных объектов"
        }
        actions={
          is_admin ? (
            <Button
              onClick={() => navigate({ to: "/objects/new" })}
              size="icon"
              title="Создать объект"
              aria-label="Создать объект"
            >
              <Plus className="size-4" />
            </Button>
          ) : undefined
        }
      />

      <Toolbar search={search} onSearch={setSearch}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm">
              Все статусы
            </SelectItem>
            {OBJECT_STATUSES.filter((s) =>
              archive ? s.v === "completed" : s.v !== "completed",
            ).map((s) => (
              <SelectItem key={s.v} value={s.v} className="text-sm">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm">
              Все типы
            </SelectItem>
            {typeOptions.map((t) => (
              <SelectItem key={t.code} value={t.code} className="text-sm">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={archive}
            onCheckedChange={(v) => {
              setArchive(v);
              setStatus("all");
            }}
          />
          Архив
        </label>
      </Toolbar>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="w-full table-fixed text-sm">
          <TableHeader>
            <TableRow>
              <SortableTh as="table" column="name" sort={sort} onToggle={toggle} className="w-[24%]">
                Наименование
              </SortableTh>
              <SortableTh as="table" column="address" sort={sort} onToggle={toggle} className="w-[16%]">
                Адрес
              </SortableTh>
              <SortableTh as="table" column="customer" sort={sort} onToggle={toggle} className="w-[14%]">
                Заказчик
              </SortableTh>
              <SortableTh as="table" column="type" sort={sort} onToggle={toggle} className="w-[8%]">
                Тип
              </SortableTh>
              <SortableTh as="table" column="responsible" sort={sort} onToggle={toggle} className="w-[14%]">
                Ответственный
              </SortableTh>
              <SortableTh as="table" column="progress" sort={sort} onToggle={toggle} className="w-[12%]">
                Готовность
              </SortableTh>
              <SortableTh as="table" column="contract" sort={sort} onToggle={toggle} className="w-[12%]">
                Окончание
              </SortableTh>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {objects.length === 0
                    ? is_admin
                      ? "Объектов пока нет. Нажмите «Создать объект»."
                      : "Вы пока не участник ни одного объекта"
                    : "Ничего не найдено"}
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <ObjectTableRow
                  key={o.id}
                  o={o}
                  onOpen={() => navigate({ to: "/objects/$id", params: { id: o.id } })}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const td = "max-w-0 px-5 py-3";

function ObjectTableRow({ o, onOpen }: { o: ObjectRow; onOpen: () => void }) {
  const tone = o.status === "completed" ? "none" : contractTone(o.contract_days_left);
  const { label: typeLabel } = useObjectTypes();
  const contractTitle = [
    o.contract_start ? `с ${formatDate(o.contract_start)}` : null,
    o.contract_end ? `по ${formatDate(o.contract_end)}` : null,
    o.status !== "completed" && o.contract_days_left !== null
      ? o.contract_days_left < 0
        ? `Просрочен на ${-o.contract_days_left} дн.`
        : o.contract_days_left === 0
          ? "Истекает сегодня"
          : `Осталось ${o.contract_days_left} дн.`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TableRow className="cursor-pointer hover:bg-elevated/40" onClick={onOpen}>
      <TableCell className={td} title={o.name}>
        <div className="truncate font-semibold leading-snug">{o.name}</div>
        {o.status !== "in_work" && (
          <div className="truncate text-xs leading-snug text-muted-foreground">{statusLabel(o.status)}</div>
        )}
      </TableCell>
      <TableCell className={`${td} text-muted-foreground`} title={o.address ?? undefined}>
        <div className="truncate">{o.address}</div>
      </TableCell>
      <TableCell className={td} title={o.customer_name ?? undefined}>
        <div className="truncate">{o.customer_name}</div>
      </TableCell>
      <TableCell className={td} title={typeLabel(o.object_type)}>
        <div className="truncate">{typeLabel(o.object_type)}</div>
      </TableCell>
      <TableCell className={td} title={o.responsible_name ?? undefined}>
        <div className="truncate">{o.responsible_name}</div>
      </TableCell>
      <TableCell className={`${td} align-middle`}>
        <div title={`${o.progress_pct}% · ${o.stages_closed} из ${o.stages_total}`}>
          <div className="relative h-5 w-full overflow-hidden rounded-md bg-muted">
            <div
              className="absolute inset-y-0 left-0 bg-success/85 transition-[width] duration-300"
              style={{ width: `${o.progress_pct}%` }}
            />
            <span className="relative z-10 flex h-full items-center justify-center text-[11px] font-semibold tabular-nums tracking-tight text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
              {o.progress_pct}%
            </span>
          </div>
          <div className="mt-0.5 text-center text-[11px] tabular-nums text-muted-foreground">
            {o.stages_closed} из {o.stages_total}
          </div>
        </div>
      </TableCell>
      <TableCell className={`${td} align-middle`}>
        <div className="text-center tabular-nums" title={contractTitle || undefined}>
          <div
            className={
              tone === "bad"
                ? "whitespace-nowrap text-danger"
                : tone === "warn"
                  ? "whitespace-nowrap text-warning"
                  : "whitespace-nowrap"
            }
          >
            {formatDate(o.contract_end) || "—"}
          </div>
          {o.status !== "completed" && o.contract_days_left !== null && (
            <div
              className={
                tone === "bad"
                  ? "mt-0.5 text-[11px] text-danger/70"
                  : tone === "warn"
                    ? "mt-0.5 text-[11px] text-warning/70"
                    : "mt-0.5 text-[11px] text-muted-foreground"
              }
            >
              {daysLeftText(o.contract_days_left)}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
