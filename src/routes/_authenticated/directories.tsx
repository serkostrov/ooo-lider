import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DocumentsDirectory } from "@/components/directories/DocumentsDirectory";
import { RepresentativesDirectory } from "@/components/directories/RepresentativesDirectory";
import { ExternalContactsDirectory } from "@/components/directories/ExternalContactsDirectory";
import { CustomersDirectory } from "@/components/directories/CustomersDirectory";
import { EmployeesDirectory } from "@/components/directories/EmployeesDirectory";
import { StatusesDirectory } from "@/components/directories/StatusesDirectory";
import { RequestStatusesDirectory } from "@/components/directories/RequestStatusesDirectory";
import { WorkTypesDirectory } from "@/components/directories/WorkTypesDirectory";
import { ObjectTypesDirectory } from "@/components/directories/ObjectTypesDirectory";
import { StagesDirectory } from "@/components/directories/stages/StagesDirectory";
import { RequestTypesDirectory } from "@/components/directories/request-types/RequestTypesDirectory";
import { BlankTemplatesDirectory } from "@/components/directories/blank-templates/BlankTemplatesDirectory";
import { RolesDirectory } from "@/components/directories/RolesDirectory";
import { RegistryJournalsDirectory } from "@/components/directories/registry-journals/RegistryJournalsDirectory";
import { PageHeader } from "@/components/PageHeader";
import { useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabValue =
  | "stages"
  | "work-types"
  | "object-types"
  | "documents"
  | "request-types"
  | "blank-templates"
  | "representatives"
  | "external-contacts"
  | "customers"
  | "employees"
  | "roles"
  | "statuses"
  | "request-statuses"
  | "registry-journals";

type TabDef = { v: TabValue; label: string };

const SECTIONS: { id: string; label: string; tabs: TabDef[] }[] = [
  {
    id: "stages",
    label: "Записи",
    tabs: [
      { v: "work-types", label: "Группы" },
      { v: "stages", label: "Этапы" },
      { v: "object-types", label: "Типы объектов" },
      { v: "documents", label: "Документы" },
      { v: "statuses", label: "Статусы этапов" },
    ],
  },
  {
    id: "requests",
    label: "Заявки",
    tabs: [
      { v: "request-types", label: "Виды заявок" },
      { v: "blank-templates", label: "Шаблоны бланков" },
      { v: "registry-journals", label: "Журналы реестра" },
      { v: "representatives", label: "Представители" },
      { v: "request-statuses", label: "Статусы заявок" },
    ],
  },
  {
    id: "org",
    label: "Оргструктура",
    tabs: [
      { v: "customers", label: "Заказчики" },
      { v: "external-contacts", label: "Внешние контакты" },
      { v: "employees", label: "Сотрудники" },
      { v: "roles", label: "Роли" },
    ],
  },
];

const TAB_VALUES = new Set<TabValue>(SECTIONS.flatMap((s) => s.tabs.map((t) => t.v)));

function tabLabel(tab: TabValue) {
  for (const s of SECTIONS) {
    const t = s.tabs.find((x) => x.v === tab);
    if (t) return t.label;
  }
  return tab;
}

export const Route = createFileRoute("/_authenticated/directories")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue } => {
    const raw = search["tab"];
    const tab =
      typeof raw === "string" && TAB_VALUES.has(raw as TabValue) ? (raw as TabValue) : undefined;
    return tab ? { tab } : {};
  },
  component: DirectoriesPage,
  head: () => ({
    meta: [
      { title: "Справочники — Лидер" },
      { name: "description", content: "Справочники в системе «Лидер»" },
      { property: "og:title", content: "Справочники — Лидер" },
      { property: "og:description", content: "Справочники в системе «Лидер»" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DirectoriesPage() {
  const { is_admin } = useProfile();
  const { tab = "work-types" } = Route.useSearch();
  const navigate = useNavigate({ from: "/directories" });
  const goTab = (next: TabValue) => navigate({ search: { tab: next }, replace: true });

  useEffect(() => {
    if (!is_admin) void navigate({ to: "/objects" });
  }, [is_admin, navigate]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Мобильный заголовок */}
      <div className="mb-3 shrink-0 lg:hidden">
        <PageHeader title="Справочники" className="mb-3" />
        <Select value={tab} onValueChange={(v) => goTab(v as TabValue)}>
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectGroup key={s.id}>
                <SelectLabel>{s.label}</SelectLabel>
                {s.tabs.map((t) => (
                  <SelectItem key={t.v} value={t.v} className="text-sm">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:gap-10">
        <aside className="hidden w-52 shrink-0 overflow-y-auto lg:block">
          <nav>
            <h1 className="mb-5 flex h-9 items-center px-2.5 text-xl font-semibold tracking-tight text-foreground">
              Справочники
            </h1>
            <div className="space-y-5">
              {SECTIONS.map((s) => (
                <div key={s.id}>
                  <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    {s.label}
                  </div>
                  <ul className="space-y-0.5">
                    {s.tabs.map((t) => {
                      const active = tab === t.v;
                      return (
                        <li key={t.v}>
                          <button
                            type="button"
                            onClick={() => goTab(t.v)}
                            className={cn(
                              "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                              active
                                ? "bg-accent font-medium text-foreground"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                            )}
                          >
                            {t.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          {tab !== "work-types" &&
            tab !== "object-types" &&
            tab !== "request-types" &&
            tab !== "blank-templates" &&
            tab !== "registry-journals" &&
            tab !== "statuses" &&
            tab !== "request-statuses" && (
              <h2 className="mb-4 flex h-9 items-center text-xl font-semibold tracking-tight">
                {tabLabel(tab)}
              </h2>
            )}
          {tab === "stages" && <StagesDirectory />}
          {tab === "work-types" && <WorkTypesDirectory />}
          {tab === "object-types" && <ObjectTypesDirectory />}
          {tab === "documents" && <DocumentsDirectory />}
          {tab === "request-types" && <RequestTypesDirectory />}
          {tab === "blank-templates" && <BlankTemplatesDirectory />}
          {tab === "registry-journals" && <RegistryJournalsDirectory />}
          {tab === "representatives" && <RepresentativesDirectory />}
          {tab === "external-contacts" && <ExternalContactsDirectory />}
          {tab === "customers" && <CustomersDirectory />}
          {tab === "employees" && <EmployeesDirectory />}
          {tab === "roles" && <RolesDirectory />}
          {tab === "statuses" && <StatusesDirectory />}
          {tab === "request-statuses" && <RequestStatusesDirectory />}
        </div>
      </div>
    </div>
  );
}
