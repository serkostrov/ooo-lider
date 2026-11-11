import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, Toolbar } from "../common";
import { useRoles, useStageTemplatesFull, useWorkTypes, type StageTemplate } from "./data";

const NO_GROUP = "__none";

export function StagesDirectory() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const { data: stages = [], isLoading } = useStageTemplatesFull();
  const { data: roles = [] } = useRoles();
  const { data: workTypes = [] } = useWorkTypes();

  const roleName = (code: string | null) => (code ? roles.find((r) => r.code === code)?.name ?? code : "");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = stages.filter(
      (s) =>
        (showInactive || s.is_active) &&
        (!q || String(s.number).startsWith(q) || s.name.toLowerCase().includes(q)),
    );
    const result: { id: string; name: string; items: StageTemplate[] }[] = workTypes.map((w) => ({
      id: w.id,
      name: w.name,
      items: visible.filter((s) => s.work_type_id === w.id),
    }));
    const orphans = visible.filter((s) => !s.work_type_id || !workTypes.some((w) => w.id === s.work_type_id));
    if (orphans.length) result.push({ id: NO_GROUP, name: "Без группы", items: orphans });
    return result.filter((g) => g.items.length > 0);
  }, [stages, workTypes, search, showInactive]);

  const open = (id: string) => navigate({ to: "/directories/stages/$id", params: { id } });

  return (
    <div>
      <Toolbar
        search={search}
        onSearch={setSearch}
        onAdd={is_admin ? () => open("new") : undefined}
      >
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Показать неактивные
        </label>
      </Toolbar>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">№</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="whitespace-nowrap">Срок, дн.</TableHead>
              <TableHead>Исполнитель</TableHead>
              <TableHead>Адресат</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? null : groups.length === 0 ? (
              <EmptyRow cols={5} />
            ) : (
              groups.flatMap((g) => [
                <TableRow
                  key={`g-${g.id}`}
                  className="bg-muted/70 hover:bg-muted/70"
                >
                  <TableCell colSpan={5} className="py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{g.name}</span>
                    <span className="ml-2.5 text-xs tabular-nums text-muted-foreground">{g.items.length}</span>
                  </TableCell>
                </TableRow>,
                ...g.items.map((s) => (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer ${s.is_active ? "" : "text-muted-foreground"}`}
                    onClick={() => open(s.id)}
                  >
                    <TableCell className="font-semibold">{s.number}</TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {s.is_critical && (
                          <Flag className="size-3.5 shrink-0 fill-destructive text-destructive" aria-label="Критичный" />
                        )}
                        {s.name}
                      </span>
                    </TableCell>
                    <TableCell>{s.duration_days ?? ""}</TableCell>
                    <TableCell>{roleName(s.executor_role)}</TableCell>
                    <TableCell>{roleName(s.confirmer_role)}</TableCell>
                  </TableRow>
                )),
              ])
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
