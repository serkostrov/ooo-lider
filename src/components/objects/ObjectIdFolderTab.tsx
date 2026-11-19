import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FolderOpen, ListFilter, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Toolbar } from "@/components/directories/common";
import { showError } from "@/lib/format";
import { formatSize, listFiles, openFile, type FileRow } from "@/lib/files";
import { fieldLabelClass, fieldStackClass } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type IdFolderItem = {
  condition_id: string;
  title: string;
  kind: string;
  is_done: boolean;
  stage_id: string;
  stage_code: string;
  stage_name: string;
  stage_status: string;
  executor_name: string | null;
};

type ConditionFile = FileRow & { entity_id: string };

const ALL = "__all";
const COLS = 5;

type IdFolderFilters = {
  executor: string;
  status: string;
  done: string; // all | missing | collected
};

const EMPTY_FILTERS: IdFolderFilters = {
  executor: ALL,
  status: ALL,
  done: ALL,
};

export function useObjectIdFolderItems(objectId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["object-id-folder", objectId],
    enabled: opts?.enabled ?? !!objectId,
    queryFn: async (): Promise<IdFolderItem[]> => {
      const { data: stages, error: stErr } = await supabase
        .from("v_object_stages")
        .select("id, code, number, name, status_name, executor_name, is_excluded")
        .eq("object_id", objectId)
        .eq("is_excluded", false)
        .order("sort");
      if (stErr) throw stErr;
      const list = stages ?? [];
      if (list.length === 0) return [];

      const stageIds = list.map((s) => s.id as string);
      const { data: conds, error: cErr } = await supabase
        .from("object_stage_conditions")
        .select("id, stage_id, title, kind, is_done, sort")
        .in("stage_id", stageIds)
        .eq("to_id_folder", true)
        .is("deleted_at", null)
        .order("sort");
      if (cErr) throw cErr;

      const byId = new Map(list.map((s) => [s.id as string, s]));
      return (conds ?? []).map((c) => {
        const s = byId.get(c.stage_id)!;
        return {
          condition_id: c.id,
          title: c.title,
          kind: c.kind,
          is_done: c.is_done,
          stage_id: c.stage_id,
          stage_code: String(s.code ?? s.number ?? ""),
          stage_name: String(s.name ?? ""),
          stage_status: String(s.status_name ?? ""),
          executor_name: (s.executor_name as string | null) ?? null,
        };
      });
    },
  });
}

function useIdFolderFiles(conditionIds: string[]) {
  const key = conditionIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["object-id-folder-files", key],
    enabled: conditionIds.length > 0,
    queryFn: () => listFiles("stage_condition", conditionIds),
  });
}

function matchesIdFolderSearch(i: IdFolderItem, files: ConditionFile[], q: string) {
  if (!q) return true;
  const names = files.map((f) => f.file_name).join(" ");
  const hay = [i.title, i.stage_code, i.stage_name, i.executor_name ?? "", i.stage_status, names]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function matchesIdFolderFilters(i: IdFolderItem, f: IdFolderFilters) {
  if (f.executor !== ALL) {
    const key = i.executor_name?.trim() || "__none";
    if (key !== f.executor) return false;
  }
  if (f.status !== ALL && i.stage_status !== f.status) return false;
  if (f.done === "missing" && i.is_done) return false;
  if (f.done === "collected" && !i.is_done) return false;
  return true;
}

export function ObjectIdFolderTab({ objectId }: { objectId: string }) {
  const { data = [], isLoading } = useObjectIdFolderItems(objectId);
  const conditionIds = useMemo(() => data.map((i) => i.condition_id), [data]);
  const { data: allFiles = [], isLoading: filesLoading } = useIdFolderFiles(conditionIds);
  const filesByCond = useMemo(() => {
    const m = new Map<string, ConditionFile[]>();
    for (const f of allFiles) {
      const list = m.get(f.entity_id) ?? [];
      list.push(f);
      m.set(f.entity_id, list);
    }
    return m;
  }, [allFiles]);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<IdFolderFilters>(EMPTY_FILTERS);
  const q = search.trim().toLowerCase();

  const executors = useMemo(() => {
    const set = new Set<string>();
    for (const i of data) {
      const n = i.executor_name?.trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [data]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const i of data) {
      if (i.stage_status) set.add(i.stage_status);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [data]);

  const activeFilterCount =
    (filters.executor !== ALL ? 1 : 0) +
    (filters.status !== ALL ? 1 : 0) +
    (filters.done !== ALL ? 1 : 0);

  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const setF = <K extends keyof IdFolderFilters>(k: K, v: IdFolderFilters[K]) =>
    setFilters((x) => ({ ...x, [k]: v }));

  const filtered = useMemo(
    () =>
      data.filter(
        (i) =>
          matchesIdFolderSearch(i, filesByCond.get(i.condition_id) ?? [], q) &&
          matchesIdFolderFilters(i, filters),
      ),
    [data, filesByCond, q, filters],
  );
  const collected = useMemo(() => filtered.filter((i) => i.is_done), [filtered]);
  const missing = useMemo(() => filtered.filter((i) => !i.is_done), [filtered]);
  const totalCollected = useMemo(() => data.filter((i) => i.is_done).length, [data]);
  const totalMissing = data.length - totalCollected;
  const hasQuery = !!q || activeFilterCount > 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton height={20} width="40%" />
        <Skeleton height={120} width="100%" borderRadius={8} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
        <FolderOpen className="size-5 text-muted-foreground" />
        <p>На объекте пока нет условий с признаком «в папку ИД».</p>
        <p className="text-xs">Отметьте флаг у условий закрытия в карточке этапа или в справочнике этапов.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-foreground">
            Папка ИД: {totalCollected}/{data.length}
          </span>
          {totalMissing > 0 ? (
            <span className="text-warning">Не хватает {totalMissing}</span>
          ) : (
            <span className="text-success">Комплект собран</span>
          )}
          {hasQuery ? (
            <span className="text-muted-foreground">
              Найдено {filtered.length} из {data.length}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Свод условий «в папку ИД». Перед герметичностью / опрессовкой комплект должен быть полным.
        </p>
      </div>

      <Toolbar search={search} onSearch={setSearch} className="mb-0 shrink-0" nowrap>
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-md border border-border">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Фильтры"
                aria-label="Фильтры"
                className="inline-flex items-center gap-1.5 px-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ListFilter className="size-3.5 shrink-0" />
                Фильтры
                {activeFilterCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              collisionPadding={12}
              className="w-[min(100vw-1.5rem,22rem)] max-h-[min(70vh,32rem)] overflow-y-auto p-0"
            >
              <div className="space-y-3 p-3 sm:p-4">
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Исполнитель</span>
                  <Select value={filters.executor} onValueChange={(v) => setF("executor", v)}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все исполнители
                      </SelectItem>
                      <SelectItem value="__none" className="text-sm">
                        Не назначен
                      </SelectItem>
                      {executors.map((name) => (
                        <SelectItem key={name} value={name} className="text-sm">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Статус этапа</span>
                  <Select value={filters.status} onValueChange={(v) => setF("status", v)}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все статусы
                      </SelectItem>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={fieldStackClass}>
                  <span className={fieldLabelClass}>Комплект</span>
                  <Select value={filters.done} onValueChange={(v) => setF("done", v)}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL} className="text-sm">
                        Все
                      </SelectItem>
                      <SelectItem value="missing" className="text-sm">
                        Не хватает
                      </SelectItem>
                      <SelectItem value="collected" className="text-sm">
                        Собрано
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <div className="sticky bottom-0 border-t border-border bg-popover p-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full text-sm"
                    onClick={resetFilters}
                  >
                    Сбросить фильтры
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="inline-flex items-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={resetFilters}
              title="Сбросить фильтры"
              aria-label="Сбросить фильтры"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card">
        <Table className="text-sm" containerClassName="max-h-none overflow-visible">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead className="min-w-[14rem] bg-muted/40">Этап</TableHead>
              <TableHead className="bg-muted/40">Документ / условие</TableHead>
              <TableHead className="min-w-[8rem] max-w-[12rem] bg-muted/40">Файлы</TableHead>
              <TableHead className="bg-muted/40">Исполнитель</TableHead>
              <TableHead className="bg-muted/40">Статус этапа</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <EmptyRow text="Ничего не найдено" />
            ) : (
              <>
                <GroupRow label="Не хватает" count={missing.length} tone="warn" />
                {missing.length === 0 ? (
                  <EmptyRow text={hasQuery ? "В этой выборке всё собрано" : "Всё собрано"} />
                ) : (
                  missing.map((i) => (
                    <ItemRow
                      key={i.condition_id}
                      i={i}
                      objectId={objectId}
                      files={filesByCond.get(i.condition_id) ?? []}
                      filesLoading={filesLoading}
                    />
                  ))
                )}
                <GroupRow label="Собрано" count={collected.length} tone="ok" />
                {collected.length === 0 ? (
                  <EmptyRow text={hasQuery ? "В этой выборке пусто" : "Пока пусто"} />
                ) : (
                  collected.map((i) => (
                    <ItemRow
                      key={i.condition_id}
                      i={i}
                      objectId={objectId}
                      files={filesByCond.get(i.condition_id) ?? []}
                      filesLoading={filesLoading}
                    />
                  ))
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GroupRow({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "warn" | "ok";
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={COLS}
        className={cn(
          "border-b border-border bg-muted/20 py-2 text-xs font-semibold uppercase tracking-wider",
          tone === "warn" ? "text-warning" : "text-muted-foreground",
        )}
      >
        {label}
        <span className="ml-1.5 tabular-nums text-muted-foreground">({count})</span>
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLS} className="py-3 text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function ItemRow({
  i,
  objectId,
  files,
  filesLoading,
}: {
  i: IdFolderItem;
  objectId: string;
  files: ConditionFile[];
  filesLoading: boolean;
}) {
  const stageLabel = i.stage_code
    ? i.stage_name
      ? `${i.stage_code}. ${i.stage_name}`
      : i.stage_code
    : i.stage_name || "";

  return (
    <TableRow>
      <TableCell>
        <Link
          to="/objects/$id/stages/$stageId"
          params={{ id: objectId, stageId: i.stage_id }}
          className="font-medium hover:text-primary hover:underline"
          title={stageLabel}
        >
          {stageLabel || "—"}
        </Link>
      </TableCell>
      <TableCell>
        <div className="font-medium">{i.title}</div>
      </TableCell>
      <TableCell className="max-w-[12rem]">
        <IdFolderFilesCell files={files} loading={filesLoading} />
      </TableCell>
      <TableCell>{i.executor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-muted-foreground">{i.stage_status}</TableCell>
    </TableRow>
  );
}

/** Короткое имя: обрезаем середину, оставляем начало и расширение. */
function shortFileName(name: string, max = 22) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  const keep = Math.max(6, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

function IdFolderFilesCell({ files, loading }: { files: ConditionFile[]; loading: boolean }) {
  if (loading) return <span className="text-xs text-muted-foreground">…</span>;
  if (files.length === 0) return <span className="text-muted-foreground">—</span>;

  if (files.length === 1) {
    const f = files[0]!;
    return (
      <button
        type="button"
        title={f.file_name}
        onClick={() => openFile(f.storage_path).catch(showError)}
        className="inline-flex max-w-full items-center gap-1.5 text-left text-sm font-medium text-primary hover:underline"
      >
        <Paperclip className="size-3.5 shrink-0" />
        <span className="truncate">{shortFileName(f.file_name)}</span>
      </button>
    );
  }

  const first = files[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-w-full gap-1.5 px-1.5 text-primary"
          title={files.map((f) => f.file_name).join("\n")}
        >
          <Paperclip className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate text-sm font-medium">{shortFileName(first.file_name, 16)}</span>
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">+{files.length - 1}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-72">
        {files.map((f) => (
          <DropdownMenuItem
            key={f.id}
            className="gap-2"
            onSelect={() => openFile(f.storage_path).catch(showError)}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
            {f.size_bytes ? (
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size_bytes)}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
