import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistryEntryDialog } from "@/components/registry/RegistryEntryDialog";
import { RegistryTable } from "@/components/registry/RegistryTable";
import {
  EMPTY_REGISTRY_FILTERS,
  filterRegistryEntries,
  RegistryToolbar,
  type RegistryFilterState,
} from "@/components/registry/RegistryToolbar";
import {
  useRegistryEntries,
  useRegistryJournals,
  type RegistryEntry,
  type RegistryJournal,
} from "@/components/registry/data";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/registry")({
  component: RegistryPage,
  head: () => ({
    meta: [
      { title: "Реестр — Лидер" },
      { name: "description", content: "Журналы исходящих и ответов по заявкам" },
    ],
  }),
});

const tabTriggerClass =
  "h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm sm:px-3 sm:text-sm";

function CountPill({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        "bg-muted text-muted-foreground",
        "group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary",
      )}
    >
      {count}
    </span>
  );
}

function JournalTabLabel({ journalId, name }: { journalId: string; name: string }) {
  const { data: rows = [] } = useRegistryEntries(journalId);
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      <CountPill count={rows.length} />
    </span>
  );
}

function ChannelPanel({
  journalId,
  journalName,
  journals,
  canEdit,
  onCountChange,
}: {
  journalId: string;
  journalName: string;
  journals: RegistryJournal[];
  canEdit: boolean;
  onCountChange?: (journalId: string, count: number) => void;
}) {
  const { data: rows = [], isLoading, error } = useRegistryEntries(journalId);

  useEffect(() => {
    onCountChange?.(journalId, rows.length);
  }, [journalId, rows.length, onCountChange]);
  const [filters, setFilters] = useState<RegistryFilterState>(EMPTY_REGISTRY_FILTERS);
  const [edit, setEdit] = useState<RegistryEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => filterRegistryEntries(rows, filters),
    [rows, filters],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <RegistryToolbar
          journalId={journalId}
          journalName={journalName}
          journals={journals}
          rows={rows}
          exportRows={filtered}
          filters={filters}
          onChange={setFilters}
          onAdd={
            canEdit
              ? () => {
                  setEdit(null);
                  setCreateOpen(true);
                }
              : undefined
          }
        />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-danger">{(error as Error).message}</p>
      ) : filtered.length === 0 && rows.length > 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Ничего не найдено. Сбросьте поиск или фильтры.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <RegistryTable
            journalId={journalId}
            rows={filtered}
            onEdit={(row) => {
              setEdit(row);
              setCreateOpen(true);
            }}
          />
        </div>
      )}
      <RegistryEntryDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setEdit(null);
        }}
        journalId={journalId}
        entry={edit}
      />
    </div>
  );
}

function RegistryPage() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const canEdit = is_admin;
  const { data: journals = [], isLoading } = useRegistryJournals(true);
  const [tab, setTab] = useState<string>("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const totalCount = useMemo(
    () => journals.reduce((sum, j) => sum + (counts[j.id] ?? 0), 0),
    [journals, counts],
  );

  const onCountChange = useMemo(
    () => (journalId: string, count: number) => {
      setCounts((prev) => (prev[journalId] === count ? prev : { ...prev, [journalId]: count }));
    },
    [],
  );

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

  useEffect(() => {
    if (!tab && journals[0]) setTab(journals[0].id);
    if (tab && journals.length && !journals.some((j) => j.id === tab)) {
      setTab(journals[0]?.id ?? "");
    }
  }, [journals, tab]);

  if (!is_admin) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Раздел доступен только администратору и руководителю.{" "}
        <Link to="/objects" className="text-primary hover:underline">
          К объектам
        </Link>
      </div>
    );
  }

  return (
    <PageFrame
      header={
        <PageHeader
          title={
            <span className="inline-flex items-center gap-2.5">
              Реестр
              {!isLoading && journals.length > 0 ? (
                <span
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-sm font-semibold tabular-nums text-muted-foreground"
                  title={`Всего записей: ${totalCount}`}
                >
                  {totalCount}
                </span>
              ) : null}
            </span>
          }
          description={
            <>
              Исходящие и ответы по журналам. Настройка полей и видов заявок — в{" "}
              <Link
                to="/directories"
                search={{ tab: "registry-journals" }}
                className="underline-offset-2 hover:underline"
              >
                Справочники → Журналы реестра
              </Link>
              .
            </>
          }
          className="mb-0"
        />
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка журналов…</p>
      ) : journals.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Нет активных журналов. Создайте в справочнике «Журналы реестра».
        </p>
      ) : (
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex h-full min-h-0 flex-col gap-4 overflow-hidden"
        >
          <TabsList
            className={cn(
              "inline-flex h-auto w-fit max-w-full shrink-0 flex-wrap justify-start gap-0.5 rounded-md border border-border bg-muted/40 p-0.5",
            )}
          >
            {journals.map((j) => (
              <TabsTrigger key={j.id} value={j.id} className={cn(tabTriggerClass, "group")}>
                <JournalTabLabel journalId={j.id} name={j.name} />
              </TabsTrigger>
            ))}
          </TabsList>
          {journals.map((j) => (
            <TabsContent
              key={j.id}
              value={j.id}
              className="mt-0 min-h-0 flex-1 overflow-hidden outline-none data-[state=inactive]:hidden"
            >
              <ChannelPanel
                journalId={j.id}
                journalName={j.name}
                journals={journals}
                canEdit={canEdit}
                onCountChange={onCountChange}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </PageFrame>
  );
}
