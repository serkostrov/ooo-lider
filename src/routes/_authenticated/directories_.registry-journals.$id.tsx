import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile";
import { showError } from "@/lib/format";
import { JournalForm } from "@/components/directories/registry-journals/JournalForm";
import {
  useDeleteRegistryJournal,
  useRegistryJournals,
} from "@/components/directories/registry-journals/data";

export const Route = createFileRoute("/_authenticated/directories_/registry-journals/$id")({
  component: RegistryJournalPage,
  head: () => ({ meta: [{ title: "Журнал реестра — Лидер" }] }),
});

function RegistryJournalPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const isNew = id === "new";
  const { data: journals = [], isLoading } = useRegistryJournals(false);
  const journal = isNew ? null : journals.find((j) => j.id === id) ?? null;
  const del = useDeleteRegistryJournal();

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

  const goList = () =>
    navigate({ to: "/directories", search: { tab: "registry-journals" } });

  const back = (
    <Link
      to="/directories"
      search={{ tab: "registry-journals" }}
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К журналам реестра
    </Link>
  );

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

  if (isLoading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {back}
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (!isNew && !journal) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {back}
        <p className="py-10 text-base text-muted-foreground">Журнал не найден или удалён</p>
      </div>
    );
  }

  const nextSort = Math.max(0, ...journals.map((j) => j.sort)) + 10;

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
      {back}
      <h1 className="mb-5 text-xl font-semibold tracking-tight">
        {journal ? journal.name : "Новый журнал реестра"}
      </h1>
      <JournalForm
        key={journal?.id ?? "new"}
        journal={journal}
        nextSort={nextSort}
        onClose={goList}
        onCreated={(newId) =>
          navigate({
            to: "/directories/registry-journals/$id",
            params: { id: newId },
            replace: true,
          })
        }
        {...(journal
          ? {
              onDelete: () => {
                if (!confirm(`Удалить журнал «${journal.name}»?`)) return;
                del.mutate(journal.id, {
                  onSuccess: () => {
                    toast.success("Удалено");
                    goList();
                  },
                  onError: showError,
                });
              },
            }
          : {})}
      />
    </div>
  );
}
