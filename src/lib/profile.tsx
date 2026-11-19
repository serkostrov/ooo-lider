import { createContext, useContext } from "react";

export type CurrentProfile = {
  id: string;
  full_name: string;
  /** Основная роль (profiles.role_code). */
  role_code: string;
  /** Все роли профиля (сметчик + снабжение и т.п.). */
  role_codes: string[];
  role_name: string;
  is_admin: boolean;
};

export const ProfileContext = createContext<CurrentProfile | null>(null);

export function useProfile(): CurrentProfile {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useProfile вне ProfileContext");
  return p;
}

export function hasRole(me: CurrentProfile, role: string): boolean {
  return me.role_codes.includes(role) || me.role_code === role;
}

export function hasAnyRole(me: CurrentProfile, roles: readonly string[]): boolean {
  return roles.some((r) => hasRole(me, r));
}
