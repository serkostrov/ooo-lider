import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/dates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type HistoryFilter = {
  objectId?: string;
  entityType?: string;
  entityId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  limit?: number;
};

export type HistoryItem = {
  id: number;
  created_at: string;
  message: string;
  entity_type: string;
  object_id: string | null;
  actor: { full_name: string } | null;
  object: { name: string } | null;
};

export function historyKey(f: HistoryFilter) {
  return ["history", f.objectId ?? "", f.entityType ?? "", f.entityId ?? "", f.from ?? "", f.to ?? "", f.limit ?? 200];
}

export function useHistory(f: HistoryFilter) {
  return useQuery({
    queryKey: historyKey(f),
    queryFn: async () => {
      let q = supabase
        .from("history")
        .select(
          "id, created_at, message, entity_type, object_id, actor:profiles!history_actor_id_fkey(full_name), object:objects!history_object_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(f.limit ?? 200);
      if (f.objectId) q = q.eq("object_id", f.objectId);
      if (f.entityType) q = q.eq("entity_type", f.entityType);
      if (f.entityId) q = q.eq("entity_id", f.entityId);
      // Границы периода — по московскому времени
      if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+03:00`);
      if (f.to) q = q.lte("created_at", `${f.to}T23:59:59+03:00`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as HistoryItem[];
    },
  });
}

/** Лента истории: дата, кто, что — таблицей. */
export function HistoryFeed({ filter, showObject }: { filter: HistoryFilter; showObject?: boolean }) {
  const { data = [], isLoading, error } = useHistory(filter);
  if (isLoading) return <p className="py-4 text-sm text-muted-foreground">Загрузка…</p>;
  if (error) return <p className="py-4 text-sm text-destructive">Не удалось загрузить историю</p>;
  if (data.length === 0) return <p className="py-4 text-sm text-muted-foreground">Записей пока нет</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-44 whitespace-nowrap">Дата</TableHead>
            <TableHead className="w-52">Кто</TableHead>
            <TableHead>Событие</TableHead>
            {showObject && <TableHead className="w-48">Объект</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((h) => (
            <TableRow key={h.id}>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatDateTime(h.created_at)}
              </TableCell>
              <TableCell className="font-medium">{h.actor?.full_name ?? "Система"}</TableCell>
              <TableCell>{h.message}</TableCell>
              {showObject && (
                <TableCell className="text-muted-foreground">{h.object?.name ?? "—"}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
