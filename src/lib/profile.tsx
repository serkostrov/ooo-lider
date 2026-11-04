import { createContext, useContext } from "react";

export type CurrentProfile = {
  id: string;
  full_name: string;
  role_code: string;
  role_name: string;
  is_admin: boolean;
};

export const ProfileContext = createContext<CurrentProfile | null>(null);

export function useProfile(): CurrentProfile {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useProfile вне ProfileContext");
  return p;
}
