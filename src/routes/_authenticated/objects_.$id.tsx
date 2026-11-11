import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tabTriggerClass } from "@/lib/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useObject } from "@/components/objects/data";
import { ObjectHeader } from "@/components/objects/ObjectHeader";
import { StagesTable } from "@/components/stages/StagesTable";
import { StagesExport } from "@/components/stages/StagesExport";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { ObjectRequests } from "@/components/requests/ObjectRequests";
import { ObjectRequestTypeButtons } from "@/components/requests/ObjectQuickCall";

const TABS = ["stages", "requests", "members", "history"] as const;
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
  const { is_admin } = useProfile();
  const { data: o, isLoading } = useObject(id);
  const [tabChromeHost, setTabChromeHost] = useState<HTMLDivElement | null>(null);

  const go = (next: { tab: Tab; type?: string | undefined }) =>
    navigate({ search: { tab: next.tab, ...(next.type ? { type: next.type } : {}) }, replace: true });

  const topBar = (actions?: ReactNode) => (
    <div className="flex h-8 items-center gap-3">
      <Link to="/objects" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" /> К объектам
      </Link>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );

  if (isLoading) return <div className="text-base text-muted-foreground">Загрузка…</div>;
  if (!o) {
    return (
      <div>
        {topBar()}
        <p className="py-10 text-base text-muted-foreground">Объект не найден или у вас нет к нему доступа</p>
      </div>
    );
  }

  const requestBadge = o.requests_new + o.requests_overdue;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        {topBar(
          is_admin ? (
            <Button asChild variant="outline" className="h-8 gap-1.5 px-2.5 text-sm">
              <Link to="/objects/$id/edit" params={{ id }}>
                <Pencil className="size-3.5" />
                Редактировать
              </Link>
            </Button>
          ) : undefined,
        )}
        <ObjectHeader o={o} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => go({ tab: v as Tab, type: v === "requests" ? type : undefined })}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="mb-6 flex shrink-0 items-center gap-3">
          <TabsList className="mb-0 grid h-9 w-1/2 min-w-0 shrink-0 grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5 sm:grid-cols-4">
            <TabsTrigger value="stages" className={tabTriggerClass}>
              Этапы
            </TabsTrigger>
            <TabsTrigger value="requests" className={tabTriggerClass}>
              Заявки
              {requestBadge > 0 && (
                <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] font-bold tabular-nums text-danger-foreground">
                  {requestBadge}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="members" className={tabTriggerClass}>
              Участники
            </TabsTrigger>
            <TabsTrigger value="history" className={tabTriggerClass}>
              История
            </TabsTrigger>
          </TabsList>
          <div
            ref={setTabChromeHost}
            className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2"
          />
        </div>

        <TabsContent
          value="stages"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
        >
          <StagesTable
            objectId={id}
            chromeHost={tab === "stages" ? tabChromeHost : null}
            toolbar={(visible) => <StagesExport objectName={o.name} stages={visible} />}
          />
        </TabsContent>

        {/* Заявки — виды слева, таблица справа; поиск/фильтры — справа от табов */}
        <TabsContent
          value="requests"
          className="mt-0 grid min-h-0 flex-1 gap-3 overflow-hidden data-[state=inactive]:hidden lg:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <aside className="min-w-0 overflow-y-auto">
            <ObjectRequestTypeButtons
              objectId={id}
              {...(type ? { activeTypeId: type } : {})}
              onSelectType={(typeId) => {
                void go({ tab: "requests", type: typeId });
              }}
            />
          </aside>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <ObjectRequests
              objectId={id}
              typeId={type}
              onTypeChange={(next) => go({ tab: "requests", type: next })}
              chromeHost={tab === "requests" ? tabChromeHost : null}
              fillHeight
            />
          </div>
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
          <HistoryFeed fillHeight filter={{ objectId: id }} />
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
  if (isLoading) return null;
  if (data.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Участники не назначены</p>;
  }
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
  );
}
