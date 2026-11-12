import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppSettings } from "@/components/directories/AppSettings";
import { PageHeader } from "@/components/PageHeader";
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

type TabValue = "login";

type TabDef = { v: TabValue; label: string };

const SECTIONS: { id: string; label: string; tabs: TabDef[] }[] = [
  {
    id: "system",
    label: "Система",
    tabs: [{ v: "login", label: "Вход" }],
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

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabValue } => {
    const raw = search["tab"];
    const tab =
      typeof raw === "string" && TAB_VALUES.has(raw as TabValue) ? (raw as TabValue) : undefined;
    return tab ? { tab } : {};
  },
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Настройки — Лидер" },
      { name: "description", content: "Настройки экрана в системе «Лидер»" },
    ],
  }),
});

function SettingsPage() {
  const { tab = "login" } = Route.useSearch();
  const navigate = useNavigate({ from: "/settings" });
  const goTab = (next: TabValue) => navigate({ search: { tab: next }, replace: true });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-3 shrink-0 lg:hidden">
        <PageHeader title="Настройки" className="mb-3" />
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
              Настройки
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
          <h2 className="mb-4 flex h-9 items-center text-xl font-semibold tracking-tight">
            {tabLabel(tab)}
          </h2>
          {tab === "login" && <AppSettings />}
        </div>
      </div>
    </div>
  );
}
