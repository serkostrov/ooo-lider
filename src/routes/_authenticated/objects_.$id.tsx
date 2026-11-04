import type { ReactNode } from "react";
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
import { ObjectQuickCall } from "@/components/requests/ObjectQuickCall";

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

  const go = (next: { tab: Tab; type?: string | undefined }) =>
    navigate({ search: { tab: next.tab, ...(next.type ? { type: next.type } : {}) }, replace: true });

  const topBar = (actions?: ReactNode) => (
    <div className="mb-4 flex h-9 items-center gap-3">
      <Link to="/objects" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
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

  return (
    <div>
      {topBar(
        <>
          <ObjectQuickCall objectId={id} />
          {is_admin && (
            <Button asChild variant="outline" size="icon" title="Редактировать" aria-label="Редактировать">
              <Link to="/objects/$id/edit" params={{ id }}>
                <Pencil className="size-4" />
              </Link>
            </Button>
          )}
        </>,
      )}
      <ObjectHeader o={o} />

      <Tabs
        value={tab}
        onValueChange={(v) => go({ tab: v as Tab, type: v === "requests" ? type : undefined })}
        className="min-w-0"
      >
        <TabsList className="mb-4 grid h-9 w-full grid-cols-2 gap-0.5 rounded-xl bg-muted p-0.5 sm:grid-cols-4">
          <TabsTrigger value="stages" className={tabTriggerClass}>Этапы</TabsTrigger>
          <TabsTrigger value="requests" className={tabTriggerClass}>Заявки</TabsTrigger>
          <TabsTrigger value="members" className={tabTriggerClass}>Участники</TabsTrigger>
          <TabsTrigger value="history" className={tabTriggerClass}>История</TabsTrigger>
        </TabsList>

        <TabsContent value="stages">
          <StagesTable
            objectId={id}
            toolbar={(visible) => <StagesExport objectName={o.name} stages={visible} />}
          />
        </TabsContent>
        <TabsContent value="requests">
          <ObjectRequests
            objectId={id}
            typeId={type}
            onTypeChange={(next) => go({ tab: "requests", type: next })}
          />
        </TabsContent>
        <TabsContent value="members">
          <MembersList objectId={id} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryFeed filter={{ objectId: id }} />
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
        .select("profile_id, profile:profiles!object_members_profile_id_fkey(full_name, phone, email, role:roles!profiles_role_code_fkey(name, sort))")
        .eq("object_id", objectId);
      if (error) throw error;
      type Row = {
        profile_id: string;
        profile: { full_name: string; phone: string | null; email: string | null; role: { name: string; sort: number } | null } | null;
      };
      return ((data ?? []) as unknown as Row[]).sort(
        (a, b) => (a.profile?.role?.sort ?? 99) - (b.profile?.role?.sort ?? 99) || (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? "", "ru"),
      );
    },
  });
  if (isLoading) return null;
  if (data.length === 0) return <p className="py-4 text-sm text-muted-foreground">Участники не назначены</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
