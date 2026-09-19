import "server-only";

import { redirect } from "next/navigation";
import type { AuthUser, UserProfile } from "@/domain/auth/types";
import { ApiError, apiFetch } from "@/lib/api/client";

export type SessionContext = {
  user: AuthUser;
  profile: UserProfile | null;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  try {
    return await apiFetch<SessionContext>("/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function requireUser(): Promise<AuthUser> {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  return session.user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (session.profile?.role !== "admin") redirect("/dashboard");

  return session.user;
}
