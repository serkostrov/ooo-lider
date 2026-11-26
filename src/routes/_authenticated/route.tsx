import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  FolderOpen,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  BookOpen,
  BookMarked,
  Settings,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ProfileContext, type CurrentProfile } from "@/lib/profile";
import { AUTH_BYPASS, BYPASS_PROFILE, BYPASS_USER_ID } from "@/lib/auth-bypass";
import { BrandMark } from "@/components/BrandMark";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { clearOverdueNotificationAck, useOverdueCounts } from "@/components/overdue/data";
import { OverdueGate, clearOverdueGateAck } from "@/components/overdue/OverdueGate";
import { useObject } from "@/components/objects/data";
import { useObjectIdFolderItems } from "@/components/objects/ObjectIdFolderTab";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OBJECT_TABS = [
  { tab: "stages", label: "Этапы", icon: Layers },
  { tab: "requests", label: "Заявки", icon: ClipboardList, badge: "requests" as const },
  { tab: "id_folder", label: "Папка ИД", icon: FolderOpen, badge: "id_folder" as const },
  { tab: "members", label: "Участники", icon: Users },
  { tab: "history", label: "История", icon: History },
] as const;

type ObjectTab = (typeof OBJECT_TABS)[number]["tab"];
type ObjectTabBadge = "requests" | "id_folder";

function objectTabBadge(sub: (typeof OBJECT_TABS)[number]): ObjectTabBadge | null {
  return "badge" in sub ? sub.badge : null;
}

/** /objects/:id или /objects/:id/stages/... — не new/edit */
function parseObjectNav(path: string): { objectId: string; onStage: boolean } | null {
  const m = path.match(/^\/objects\/([^/]+)(?:\/(.*))?$/);
  if (!m) return null;
  const objectId = m[1]!;
  if (objectId === "new") return null;
  const rest = m[2] ?? "";
  if (rest === "edit" || rest.startsWith("edit/")) return null;
  return { objectId, onStage: rest.startsWith("stages/") };
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (AUTH_BYPASS) return { userId: BYPASS_USER_ID };
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    return { userId: data.user.id };
  },
  component: AuthLayout,
});

function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    if (AUTH_BYPASS) return;
    clearOverdueNotificationAck();
    clearOverdueGateAck();
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };
}

function AuthLayout() {
  const { userId } = Route.useRouteContext();
  const signOut = useSignOut();
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["current-profile", userId],
    enabled: !AUTH_BYPASS,
    queryFn: async (): Promise<CurrentProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role_code, roles!profiles_role_code_fkey(name, is_admin)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const role = (data as any).roles as { name: string; is_admin: boolean } | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pr, error: prErr } = await (supabase as any)
        .from("profile_roles")
        .select("role_code")
        .eq("profile_id", data.id);
      if (prErr) throw prErr;
      const role_codes = [
        ...new Set(
          [
            ...((pr ?? []) as { role_code: string }[]).map((r) => r.role_code),
            data.role_code as string,
          ].filter(Boolean),
        ),
      ];
      let role_name = role?.name ?? "";
      if (role_codes.length > 1) {
        const { data: roleRows } = await supabase
          .from("roles")
          .select("code, name")
          .in("code", role_codes);
        const nameByCode = new Map((roleRows ?? []).map((r) => [r.code, r.name]));
        role_name = role_codes.map((c) => nameByCode.get(c) ?? c).join(", ");
      }
      return {
        id: data.id,
        full_name: data.full_name,
        role_code: data.role_code,
        role_codes,
        role_name,
        is_admin: !!role?.is_admin,
      };
    },
  });

  const resolved = AUTH_BYPASS ? BYPASS_PROFILE : profile;

  if (!AUTH_BYPASS && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground animate-in fade-in duration-300">
          <BrandMark className="size-8" />
          <span className="text-sm">Загрузка…</span>
        </div>
      </div>
    );
  }
  if (!AUTH_BYPASS && (error || !resolved)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-center animate-in fade-in duration-300">
        <BrandMark className="size-10 text-lg" />
        <p className="text-base font-semibold text-foreground">
          Нет доступа. Обратитесь к администратору
        </p>
        <Button onClick={signOut} variant="secondary" className="h-10 px-4 text-sm">
          Выйти
        </Button>
      </div>
    );
  }

  return (
    <ProfileContext.Provider value={resolved!}>
      <Shell profile={resolved!} onSignOut={signOut} />
    </ProfileContext.Provider>
  );
}

/** Счётчик «Заявки» — только непросмотренные новые (не просроченные). */
function useNewRequestsCount() {
  return useQuery({
    queryKey: ["requests-attention-count"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("v_requests" as any)
        .select("*", { count: "exact", head: true })
        .eq("is_new", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

const items = [
  { to: "/director", label: "Панель управления", icon: LayoutDashboard, adminOnly: true },
  { to: "/objects", label: "Объекты", icon: Building2 },
  { to: "/requests", label: "Заявки", icon: ClipboardList, badge: "requests" },
  { to: "/registry", label: "Реестр", icon: BookMarked, adminOnly: true },
  { to: "/overdue", label: "Просрочено", icon: AlertTriangle, badge: "overdue" },
  { to: "/history", label: "История", icon: History },
  { to: "/directories", label: "Справочники", icon: BookOpen, adminOnly: true },
  { to: "/settings", label: "Настройки", icon: Settings },
] as const;

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Компактный счётчик на иконке — как уведомление в мессенджере. */
function NavCount({ count, tone }: { count: number; tone: "signal" | "danger" }) {
  if (count <= 0) return null;
  const label = count > 9 ? "9+" : String(count);
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold leading-none tabular-nums",
        tone === "danger"
          ? "bg-danger text-danger-foreground"
          : "bg-signal text-[oklch(0.18_0.04_55)]",
      )}
    >
      {label}
    </span>
  );
}

const SIDEBAR_KEY = "lider.sidebar-collapsed";
const SIDEBAR_EXPANDED = "w-52";
const SIDEBAR_COLLAPSED = "w-14";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/** Дерево разделов текущего объекта под пунктом «Объекты». */
function ObjectSubnav({
  objectId,
  objectName,
  activeTab,
  onStage,
  badges,
  collapsed,
  onNavigate,
}: {
  objectId: string;
  objectName: string | null;
  activeTab: ObjectTab;
  onStage: boolean;
  badges: { requests: number; id_folder: number };
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  if (collapsed) {
    return (
      <div className="my-1 flex flex-col items-center gap-0.5 py-1">
        {OBJECT_TABS.map((sub) => {
          const subActive = onStage ? sub.tab === "stages" : activeTab === sub.tab;
          const badgeKey = objectTabBadge(sub);
          const subBadge = badgeKey ? badges[badgeKey] : 0;
          const tip = subBadge > 0 ? `${sub.label} · ${subBadge}` : `${sub.label} объекта`;
          return (
            <Link
              key={sub.tab}
              to="/objects/$id"
              params={{ id: objectId }}
              search={{ tab: sub.tab }}
              onClick={onNavigate}
              title={tip}
              aria-label={tip}
              className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-md transition-colors",
                subActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
              )}
            >
              <sub.icon className="size-3.5" />
              {subBadge > 0 ? (
                <NavCount
                  count={subBadge}
                  tone={badgeKey === "requests" ? "danger" : "signal"}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mb-1 ml-2.5 mt-0.5">
      <div className="relative mb-0.5">
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-[5px] top-1.5 w-px bg-sidebar-border"
        />
        <div
          className="truncate pl-0.5 text-[11px] leading-snug text-sidebar-foreground/50"
          title={objectName ?? "Объект"}
        >
          {objectName || "Объект"}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {OBJECT_TABS.map((sub, i) => {
          const subActive = onStage ? sub.tab === "stages" : activeTab === sub.tab;
          const badgeKey = objectTabBadge(sub);
          const subBadge = badgeKey ? badges[badgeKey] : 0;
          const last = i === OBJECT_TABS.length - 1;
          return (
            <li key={sub.tab} className="relative pl-3">
              {/* вертикаль: у последнего — только до середины (└) */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-[5px] top-0 w-px bg-sidebar-border",
                  last ? "h-1/2" : "bottom-0",
                )}
              />
              {/* горизонтальный штрих */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-[5px] top-1/2 h-px w-2.5 -translate-y-1/2 bg-sidebar-border"
              />
              <Link
                to="/objects/$id"
                params={{ id: objectId }}
                search={{ tab: sub.tab }}
                onClick={onNavigate}
                title={sub.label}
                className={cn(
                  "relative flex h-7 items-center gap-2 rounded-md px-1.5 text-[12.5px] transition-colors",
                  subActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
                )}
              >
                <sub.icon
                  className={cn("size-3.5 shrink-0", subActive ? "text-primary" : "opacity-65")}
                />
                <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                {subBadge > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[9px] font-bold tabular-nums leading-4",
                      badgeKey === "requests"
                        ? "bg-danger text-danger-foreground"
                        : "bg-signal text-[oklch(0.18_0.04_55)]",
                    )}
                  >
                    {subBadge > 9 ? "9+" : subBadge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Nav({
  profile,
  onSignOut,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  profile: CurrentProfile;
  onSignOut: () => void;
  onNavigate?: () => void;
  /** true — только иконки; false — иконки + подписи */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const objectNav = parseObjectNav(path);
  const objectId = objectNav?.objectId ?? null;
  const searchTab = search["tab"];
  const objectTab: ObjectTab =
    objectNav?.onStage
      ? "stages"
      : OBJECT_TABS.some((t) => t.tab === searchTab)
        ? (searchTab as ObjectTab)
        : "stages";

  const { data: objectRow } = useObject(objectId ?? "", { enabled: !!objectId });
  const { data: idFolderItems = [] } = useObjectIdFolderItems(objectId ?? "", {
    enabled: !!objectId,
  });
  const objectBadges = {
    requests: objectRow ? objectRow.requests_new + objectRow.requests_overdue : 0,
    id_folder: idFolderItems.filter((i) => !i.is_done).length,
  };

  const { data: count = 0 } = useNewRequestsCount();
  const { data: overdueCounts } = useOverdueCounts();
  const { theme, toggleTheme } = useTheme();
  const badges = { requests: count, overdue: overdueCounts?.total ?? 0 };
  const themeLabel = theme === "dark" ? "Светлая тема" : "Тёмная тема";

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar bg-gradient-to-b from-[#28282a] via-sidebar to-[#0a0a0b] text-sidebar-foreground dark:from-transparent dark:via-transparent dark:to-transparent">
      {collapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-1 px-2 py-2">
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Развернуть меню"
              title="Развернуть меню"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <BrandMark className="size-8 shrink-0 text-sm" />
        </div>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-2">
          <span className="inline-flex w-10 shrink-0 items-center justify-center">
            <BrandMark className="size-8 shrink-0 text-sm" />
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="truncate font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
              Лидер
            </div>
            <div className="truncate text-[11px] text-sidebar-foreground/65">Этапы и заявки</div>
          </div>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Свернуть меню"
              title="Свернуть меню"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {items
          .filter((it) => !("adminOnly" in it && it.adminOnly) || profile.is_admin)
          .map((it) => {
            const isObjects = it.to === "/objects";
            const objectsOpen = isObjects && !!objectId;
            const active = objectsOpen
              ? path === "/objects"
              : path === it.to || path.startsWith(it.to + "/");
            const badgeKey = "badge" in it ? it.badge : null;
            const badgeCount = badgeKey ? badges[badgeKey] : 0;
            const badgeTone = badgeKey === "overdue" ? "danger" : "signal";
            const tip = badgeCount > 0 ? `${it.label} · ${badgeCount}` : it.label;
            return (
              <div key={it.to} className="flex flex-col gap-0.5">
                <Link
                  to={it.to}
                  onClick={onNavigate}
                  title={tip}
                  aria-label={tip}
                  className={cn(
                    "group/item relative flex h-9 items-center rounded-md text-sm transition-colors duration-150",
                    collapsed ? "justify-center" : "gap-2.5",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : objectsOpen
                        ? "text-sidebar-accent-foreground/90"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {(active || objectsOpen) && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary",
                        active && "shadow-[0_0_10px_#286cf280]",
                        objectsOpen && !active && "opacity-40",
                      )}
                    />
                  )}
                  <span className="inline-flex w-10 shrink-0 items-center justify-center">
                    <span className="relative inline-flex size-8 items-center justify-center rounded-md">
                      <it.icon
                        className={cn(
                          "size-[1.125rem]",
                          active || objectsOpen
                            ? "text-primary"
                            : "opacity-75 group-hover/item:opacity-100",
                        )}
                      />
                      {badgeKey && <NavCount count={badgeCount} tone={badgeTone} />}
                    </span>
                  </span>
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                </Link>

                {objectsOpen && objectId ? (
                  <ObjectSubnav
                    objectId={objectId}
                    objectName={objectRow?.name ?? null}
                    activeTab={objectTab}
                    onStage={!!objectNav?.onStage}
                    badges={objectBadges}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                ) : null}
              </div>
            );
          })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border px-2 py-1.5">
        <NotificationsBell collapsed={collapsed} onNavigate={onNavigate} />
        <button
          type="button"
          onClick={toggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          className={cn(
            "mt-0.5 flex h-9 w-full items-center rounded-md text-sm transition-colors",
            "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="inline-flex w-10 shrink-0 items-center justify-center">
            {theme === "dark" ? <Sun className="size-[1.125rem] opacity-75" /> : <Moon className="size-[1.125rem] opacity-75" />}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{themeLabel}</span>}
        </button>
        <div className="my-1.5 border-t border-sidebar-border" />
        <div className={cn("flex h-9 items-center", collapsed ? "justify-center" : "gap-2.5")}>
          <span className="inline-flex w-10 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="inline-flex size-8 items-center justify-center rounded-md bg-sidebar-accent/70 text-[11px] font-semibold text-sidebar-accent-foreground"
            >
              {profileInitials(profile.full_name)}
            </span>
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-sidebar-accent-foreground">
                {profile.full_name}
              </div>
              {profile.role_name && (
                <div className="truncate text-[11px] text-sidebar-foreground/65">{profile.role_name}</div>
              )}
            </div>
          )}
          {!AUTH_BYPASS && !collapsed && (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Выйти"
              title="Выйти"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        {collapsed && !AUTH_BYPASS && (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Выйти"
            title="Выйти"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Shell({ profile, onSignOut }: { profile: CurrentProfile; onSignOut: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 ease-out lg:block",
          sidebarWidth,
        )}
      >
        <Nav
          profile={profile}
          onSignOut={onSignOut}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>
      <div className={cn("hidden shrink-0 transition-[width] duration-200 ease-out lg:block", sidebarWidth)} aria-hidden />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-accent-foreground lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent"
            aria-label="Меню"
          >
            <Menu className="size-5" />
          </button>
          <BrandMark className="size-6 text-xs" />
          <span className="text-sm font-semibold">Лидер</span>
        </header>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-64 border-0 bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetTitle className="sr-only">Меню</SheetTitle>
            <Nav profile={profile} onSignOut={onSignOut} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/*
            Высота фиксирована: списки (PageFrame) крутят только таблицу, шапка страницы стоит.
            Длинные карточки сами ставят overflow-y-auto на корень.
          */}
          {/* Без max-width: на 27″/ультравайде таблица тянется на всю ширину, а не «колонка по центру» */}
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4 lg:px-8 lg:py-5 xl:px-10">
            <Outlet />
          </div>
        </main>
      </div>
      <OverdueGate />
    </div>
  );
}
