import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { canCreateAdhocStage } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useObject } from "@/components/objects/data";
import { ObjectHeader } from "@/components/objects/ObjectHeader";
import { ObjectEmergencyButton } from "@/components/objects/ObjectEmergency";
import { StagesTable } from "@/components/stages/StagesTable";
import { StagesExport } from "@/components/stages/StagesExport";
import { ObjectStagesSchema } from "@/components/stages/ObjectStagesSchema";
import { StageDeadlinesBulk } from "@/components/stages/StageDeadlinesBulk";
import { AddAdhocStageDialog } from "@/components/stages/AddAdhocStageDialog";
import { useObjectStages } from "@/components/stages/data";
import { ObjectHistoryPanel } from "@/components/history/ObjectHistoryPanel";
import { ObjectRequests } from "@/components/requests/ObjectRequests";
import { ObjectRequestTypeButtons } from "@/components/requests/ObjectQuickCall";
import { ObjectIdFolderTab } from "@/components/objects/ObjectIdFolderTab";
import { cn } from "@/lib/utils";

const TABS = ["stages", "requests", "id_folder", "members", "history"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/objects_/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; type?: string } => {
    const tab = TABS.find((t) => t === search["tab"]);
    const type = typeof search["type"] === "string" ? search["type"] : undefined;
    return { ...(tab ? { tab } : {}), ...(type ? { type } : {}) };
  },
  component: ObjectPage,
  head: () => ({ meta: [{ title: "Объект — Лидер" }] }),
});

function ObjectPage() {
  const { id } = Route.useParams();
  const { tab = "stages", type } = Route.useSearch();
  const navigate = useNavigate({ from: "/objects/$id" });
  const me = useProfile();
  const { is_admin } = me;
  const allowAdhoc = canCreateAdhocStage(me);
  const { data: o, isLoading } = useObject(id);
  const { data: stages = [] } = useObjectStages(id);
  const [tabChromeHost, setTabChromeHost] = useState<HTMLDivElement | null>(null);
  const [stagesLayout, setStagesLayout] = useState<"table" | "schema">("table");

  const go = (next: { tab: Tab; type?: string | undefined }) =>
    navigate({ search: { tab: next.tab, ...(next.type ? { type: next.type } : {}) }, replace: true });

  const topBar = (actions?: ReactNode) => (
    <div className="flex h-8 items-center gap-2">
      <Link
        to="/objects"
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4 shrink-0" />
        <span className="truncate">К объектам</span>
      </Link>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="shrink-0 space-y-3">
          {topBar()}
          <ObjectHeaderSkeleton />
        </div>
        <StagesTable objectId={id} />
      </div>
    );
  }
  if (!o) {
    return (
      <div>
        {topBar()}
        <p className="py-10 text-base text-muted-foreground">Объект не найден или у вас нет к нему доступа</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 sm:gap-3">
      <div className="shrink-0 space-y-1.5 sm:space-y-3">
        {topBar(
          <>
            <ObjectEmergencyButton objectId={id} active={!!o.emergency} />
            {is_admin ? (
              <Button asChild variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
                <Link to="/objects/$id/edit" params={{ id }} title="Редактировать">
                  <Pencil className="size-3.5 shrink-0" />
                  <span className="hidden sm:inline">Редактировать</span>
                </Link>
              </Button>
            ) : null}
          </>,
        )}
        <ObjectHeader o={o} />
      </div>

      {/* Разделы объекта — в левом меню; здесь только контент + компактный тулбар */}
      <Tabs value={tab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TabsContent
          value="stages"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="mb-2 flex shrink-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-full items-center gap-1.5 sm:w-auto sm:shrink-0">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-0.5 rounded-md bg-muted p-0.5 sm:inline-flex sm:w-auto sm:flex-none">
                {(
                  [
                    { id: "table" as const, label: "Таблица" },
                    { id: "schema" as const, label: "Схема" },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={stagesLayout === b.id}
                    onClick={() => setStagesLayout(b.id)}
                    className={cn(
                      "h-7 flex-1 rounded-sm px-2.5 text-sm font-medium transition-colors sm:flex-none",
                      stagesLayout === b.id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {allowAdhoc ? <AddAdhocStageDialog objectId={id} compact /> : null}
                {is_admin ? <StageDeadlinesBulk objectId={id} compact /> : null}
                {stagesLayout === "schema" ? (
                  <StagesExport objectName={o.name} stages={stages} />
                ) : null}
              </div>
            </div>
            <div
              ref={tab === "stages" && stagesLayout === "table" ? setTabChromeHost : undefined}
              className="flex w-full min-w-0 flex-wrap items-center gap-1.5 empty:hidden sm:w-auto sm:flex-1"
            />
          </div>
          {stagesLayout === "schema" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <ObjectStagesSchema objectId={id} stages={stages} />
            </div>
          ) : (
            <StagesTable
              objectId={id}
              chromeHost={tab === "stages" && stagesLayout === "table" ? tabChromeHost : null}
              toolbar={(visible) => <StagesExport objectName={o.name} stages={visible} />}
            />
          )}
        </TabsContent>

        <TabsContent
          value="requests"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-3">
            <aside className="min-w-0 shrink-0 lg:overflow-y-auto">
              <ObjectRequestTypeButtons
                objectId={id}
                {...(type ? { activeTypeId: type } : {})}
                onSelectType={(typeId) => {
                  void go({ tab: "requests", type: typeId });
                }}
              />
            </aside>
            <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
              <div
                ref={tab === "requests" ? setTabChromeHost : undefined}
                className="flex min-h-8 w-full shrink-0 flex-wrap items-center gap-2 empty:hidden"
              />
              <ObjectRequests
                objectId={id}
                typeId={type}
                onTypeChange={(next) => go({ tab: "requests", type: next })}
                chromeHost={tab === "requests" ? tabChromeHost : null}
                fillHeight
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="id_folder"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <ObjectIdFolderTab objectId={id} />
        </TabsContent>

        <TabsContent
          value="members"
          className="mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden"
        >
          <MembersList objectId={id} />
        </TabsContent>

        <TabsContent
          value="history"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ObjectHistoryPanel objectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MembersList({ objectId }: { objectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["object-members-full", objectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("object_members")
        .select(
          "profile_id, profile:profiles!object_members_profile_id_fkey(full_name, phone, email, role:roles!profiles_role_code_fkey(name, sort))",
        )
        .eq("object_id", objectId);
      if (error) throw error;
      type Row = {
        profile_id: string;
        profile: {
          full_name: string;
          phone: string | null;
          email: string | null;
          role: { name: string; sort: number } | null;
        } | null;
      };
      return ((data ?? []) as unknown as Row[]).sort(
        (a, b) =>
          (a.profile?.role?.sort ?? 99) - (b.profile?.role?.sort ?? 99) ||
          (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? "", "ru"),
      );
    },
  });
  if (isLoading) return <MembersTableSkeleton />;
  if (data.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Участники не назначены</p>;
  }
  return (
    <>
      <div className="space-y-2 md:hidden">
        {data.map((m) => (
          <article
            key={m.profile_id}
            className="rounded-lg border border-border/70 bg-card px-3 py-2.5"
          >
            <div className="font-medium">{m.profile?.full_name ?? "—"}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {m.profile?.role?.name ?? "—"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {m.profile?.phone ? (
                <span className="tabular-nums">{m.profile.phone}</span>
              ) : null}
              {m.profile?.email ? <span className="break-all">{m.profile.email}</span> : null}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
              <TableHead>ФИО</TableHead>
              <TableHead>Должность</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((m) => (
              <TableRow key={m.profile_id}>
                <TableCell className="font-medium">{m.profile?.full_name ?? "—"}</TableCell>
                <TableCell>{m.profile?.role?.name ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{m.profile?.phone || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{m.profile?.email || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ObjectHeaderSkeleton() {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="space-y-3 px-4 py-3">
        <Skeleton height={22} width="42%" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton height={28} width={168} borderRadius={6} />
          <Skeleton height={28} width={220} borderRadius={6} />
          <Skeleton height={14} width={160} />
        </div>
      </div>
      <div className="border-t border-border px-4 py-2">
        <Skeleton height={12} width={96} />
      </div>
    </div>
  );
}

function MembersTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
            <TableHead>ФИО</TableHead>
            <TableHead>Должность</TableHead>
            <TableHead>Телефон</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell>
                <Skeleton height={16} width={`${48 + (i % 3) * 10}%`} />
              </TableCell>
              <TableCell>
                <Skeleton height={16} width="70%" />
              </TableCell>
              <TableCell>
                <Skeleton height={16} width={112} />
              </TableCell>
              <TableCell>
                <Skeleton height={16} width="80%" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
