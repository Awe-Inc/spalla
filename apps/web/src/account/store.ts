import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, configureApiAuth } from "@/api/client";
import type { Me, Permission, SessionResponse, SignupInput } from "@/api/types";

interface AccountState {
  token: string | null;
  user: Me | null;
  setSession: (session: SessionResponse) => void;
  setUser: (user: Me) => void;
  clear: () => void;
}

export const useAccount = create<AccountState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (session) => set({ token: session.token, user: session.user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "fretless-conta", version: 1, partialize: (state) => ({ token: state.token, user: state.user }) },
  ),
);

configureApiAuth({
  getToken: () => useAccount.getState().token,
  onUnauthorized: () => useAccount.getState().clear(),
});

export function can(user: Me | null, ...permissions: Permission[]): boolean {
  if (!user) return false;
  return permissions.some((permission) => user.permissions.includes(permission));
}

export const ADMIN_PERMISSIONS: readonly Permission[] = [
  "users.read",
  "users.manage",
  "roles.manage",
  "invites.manage",
  "teachers.approve",
  "audit.read",
  "reports.read",
  "settings.manage",
];

export const TEACHER_PERMISSIONS: readonly Permission[] = ["classes.manage", "assignments.manage", "materials.manage", "plans.manage", "students.progress.read"];

export function isAdminUser(user: Me | null): boolean {
  return can(user, ...ADMIN_PERMISSIONS);
}

export function isTeacherUser(user: Me | null): boolean {
  return can(user, ...TEACHER_PERMISSIONS);
}

export function isStudentUser(user: Me | null): boolean {
  return can(user, "lessons.read");
}

export async function login(email: string, password: string): Promise<Me> {
  const session = await api.post<SessionResponse>("/auth/login", { email, password });
  useAccount.getState().setSession(session);
  return session.user;
}

export async function signup(input: SignupInput): Promise<SessionResponse> {
  const session = await api.post<SessionResponse>("/auth/signup", input);
  useAccount.getState().setSession(session);
  return session;
}

export async function refreshMe(): Promise<Me | null> {
  if (!useAccount.getState().token) return null;
  const user = await api.get<Me>("/auth/me");
  useAccount.getState().setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } finally {
    useAccount.getState().clear();
  }
}

export function homePathFor(user: Me): string {
  if (isAdminUser(user)) return "/admin";
  if (isTeacherUser(user)) return "/professor";
  if (isStudentUser(user)) return "/aulas";
  return "/conta";
}
