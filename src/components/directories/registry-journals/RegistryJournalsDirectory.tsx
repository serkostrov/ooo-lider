import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/profile";
import { DirectoryListSkeleton, directoryListHeader } from "@/components/directories/DirectorySkeleton";
import { thLabelClass } from "@/lib/ui";
import { useRegistryJournals } from "./data";

export function RegistryJournalsDirectory() {
  const { is_admin } = useProfile();
  const navigate = useNavigate();
  const { data: journals = [], isLoading } = useRegistryJournals(false);

  const open = (id: string) =>
    navigate({ to: "/directories/registry-journals/$id", params: { id } });

  return (
    <div className="w-full">
      <div className="mb-4 flex h-9 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Журналы реестра</h2>
        {is_admin ? (
          <Button onClick={() => open("new")} className="h-9 gap-1.5 px-3 text-sm">
            <Plus className="size-4" />
            Добавить журнал
          </Button>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Настройте вкладки реестра: поля таблицы и какие виды заявок пишут строку при отправке.
      </p>
      {isLoading ? (
        <DirectoryListSkeleton header={directoryListHeader(["№", "Название", "Код", "Виды"])} />
      ) : journals.length === 0 ? (
        <p className="rounded-md border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          Журналов пока нет
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <div className={`${thLabelClass} w-10 shrink-0`}>№</div>
            <div className={`${thLabelClass} min-w-0 flex-1`}>Название</div>
            <div className={`${thLabelClass} w-28 shrink-0`}>Код</div>
            <div className={`${thLabelClass} w-20 shrink-0 text-right`}>Статус</div>
          </div>
          <ul>
            {journals.map((j, i) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => open(j.id)}
                  className="flex w-full items-center gap-2 border-b border-border/70 px-3 py-2.5 text-left last:border-0 hover:bg-muted/30"
                >
                  <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{j.name}</span>
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{j.code}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                    {j.is_active ? "активен" : "выкл"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
