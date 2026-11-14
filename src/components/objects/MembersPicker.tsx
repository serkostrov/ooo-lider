import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MEMBER_ROLES,
  useActiveProfiles,
  useRolesForMembers,
  type ProfileShort,
} from "./data";

/**
 * Выбор участников объекта по ролям, несколько человек на роль (ТЗ 7.3, шаг 2).
 * Правка 2.7: у каждой роли — выпадающий список с поиском и галочками, выбранные — метками под ним,
 * чтобы 30 прорабов не растягивали страницу.
 */
export function MembersPicker({
  value,
  onToggle,
  disabled,
}: {
  value: string[];
  onToggle: (profileId: string, checked: boolean) => void;
  disabled?: boolean;
}) {
  const { data: profiles = [], isLoading: loadingProfiles } = useActiveProfiles();
  const { data: roles = [], isLoading: loadingRoles } = useRolesForMembers();
  const groups = useMemo(() => {
    const known = new Set<string>(MEMBER_ROLES.map((r) => r.code));
    const byCode = new Map(roles.map((r) => [r.code, r]));
    const primary = MEMBER_ROLES.map((r) => {
      const meta = byCode.get(r.code);
      return {
        code: r.code,
        title: meta?.name ?? r.label,
        people: profiles.filter((p) => p.role_code === r.code),
        required: !!meta?.required_on_object_create,
      };
    });
    const extras = roles
      .filter((r) => !known.has(r.code) && !r.is_admin)
      .map((r) => ({
        code: r.code,
        title: r.name,
        people: profiles.filter((p) => p.role_code === r.code),
        required: r.required_on_object_create,
      }))
      .filter((g) => g.people.length > 0 || g.required);
    return [...primary, ...extras];
  }, [roles, profiles]);

  if (loadingProfiles || loadingRoles) return null;

  return (
    <div className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <RoleSelect
          key={g.code}
          title={g.title}
          required={g.required}
          people={g.people}
          value={value}
          onToggle={onToggle}
          disabled={disabled ?? false}
          {...(g.required ? { hint: "Обязательно хотя бы один при создании объекта" } : {})}
        />
      ))}
    </div>
  );
}

/** Сколько меток показывать сразу; остальные — «ещё N», раскрываются по нажатию. */
const CHIPS_LIMIT = 6;

function RoleSelect({
  title,
  required,
  people,
  value,
  onToggle,
  disabled,
  hint,
}: {
  title: string;
  required?: boolean;
  people: ProfileShort[];
  value: string[];
  onToggle: (profileId: string, checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const picked = people.filter((p) => value.includes(p.id));
  const q = search.trim().toLowerCase();
  const found = q ? people.filter((p) => p.full_name.toLowerCase().includes(q)) : people;
  const allFoundPicked = found.length > 0 && found.every((p) => value.includes(p.id));
  const chips = showAll ? picked : picked.slice(0, CHIPS_LIMIT);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold">
          {title}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {people.length > 0 && (
          <span className="text-xs text-muted-foreground">
            выбрано {picked.length} из {people.length}
          </span>
        )}
        {hint && <span className="w-full text-xs text-muted-foreground">{hint}</span>}
      </div>

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет сотрудников с этой ролью — добавьте в «Справочники → Сотрудники»</p>
      ) : (
        <>
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm transition-colors hover:bg-muted/40 disabled:opacity-60"
              >
                <span className={`min-w-0 flex-1 truncate ${picked.length ? "" : "text-muted-foreground"}`}>
                  {picked.length === 0
                    ? "Выберите сотрудников"
                    : picked.length === 1
                      ? picked[0]!.full_name
                      : `Выбрано: ${picked.length}`}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
              {people.length > 7 && (
                <div className="relative border-b p-2">
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по ФИО"
                    className="h-8 pl-8 text-sm"
                    autoFocus
                  />
                </div>
              )}
              <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {found.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Никого не найдено</p>
                ) : (
                  found.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                      <Checkbox
                        className="size-4"
                        checked={value.includes(p.id)}
                        disabled={disabled}
                        onCheckedChange={(c) => onToggle(p.id, c === true)}
                      />
                      <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                    </label>
                  ))
                )}
              </div>
              {found.length > 1 && (
                <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-primary hover:underline disabled:opacity-60"
                    onClick={() =>
                      found.forEach((p) => {
                        if (value.includes(p.id) === allFoundPicked) onToggle(p.id, !allFoundPicked);
                      })
                    }
                  >
                    {allFoundPicked ? "Снять всех" : q ? "Отметить найденных" : "Отметить всех"}
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                    Готово
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {picked.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((p) => (
                <span key={p.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted py-0.5 pl-2 pr-1 text-xs">
                  <span className="truncate">{p.full_name}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(p.id, false)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={`Убрать ${p.full_name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {picked.length > CHIPS_LIMIT && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="px-1 text-xs text-primary hover:underline">
                  {showAll ? "свернуть" : `ещё ${picked.length - CHIPS_LIMIT}`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
