import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { RegistryEntryForm } from "@/components/registry/RegistryEntryForm";
import { useRegistryEntry, useRegistryJournals } from "@/components/registry/data";
import { useProfile } from "@/lib/profile";

type EntrySearch = { journal?: string };

export const Route = createFileRoute("/_authenticated/registry_/$entryId")({
  component: RegistryEntryPage,
  validateSearch: (search: Record<string, unknown>): EntrySearch => {
    const raw = search["journal"];
    if (typeof raw === "string" && raw) return { journal: raw };
    return {};
  },
  head: () => ({
    meta: [{ title: "Запись реестра — Лидер" }],
  }),
});

function RegistryEntryPage() {
  const { entryId } = Route.useParams();
  const { journal: journalFromSearch } = Route.useSearch();
  const navigate = useNavigate();
  const { is_admin } = useProfile();
  const isNew = entryId === "new";
  const { data: entry = null, isLoading: entryLoading } = useRegistryEntry(
    isNew ? null : entryId,
  );
  const { data: journals = [] } = useRegistryJournals(false);

  const journalId = isNew ? journalFromSearch : entry?.journal_id;
  const journal = journals.find((j) => j.id === journalId) ?? null;

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

  const backToList = () =>
    navigate({
      to: "/registry",
    });

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

  const back = (
    <Link
      to="/registry"
      className="mb-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="size-4" /> К реестру
    </Link>
  );

  if (!isNew && entryLoading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {back}
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (!isNew && !entry) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {back}
        <p className="py-10 text-base text-muted-foreground">Запись не найдена или удалена</p>
      </div>
    );
  }

  if (isNew && !journalId) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {back}
        <p className="py-10 text-base text-muted-foreground">
          Не указан журнал. Вернитесь в реестр и нажмите «Добавить».
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-6">
      {back}
      <h1 className="mb-1 text-xl font-semibold tracking-tight">
        {entry ? `Запись №${entry.number}` : "Новая запись реестра"}
      </h1>
      {journal ? (
        <p className="mb-5 text-sm text-muted-foreground">Журнал: {journal.name}</p>
      ) : (
        <div className="mb-5" />
      )}
      <RegistryEntryForm
        key={entry?.id ?? `new-${journalId}`}
        journalId={journalId!}
        entry={entry}
        onSaved={(id) => {
          if (isNew) {
            void navigate({
              to: "/registry/$entryId",
              params: { entryId: id },
              replace: true,
            });
          } else {
            backToList();
          }
        }}
        onCancel={backToList}
      />
    </div>
  );
}
