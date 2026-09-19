import { Elysia } from "elysia";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { createSupabasePublicClient, createSupabaseUserClient } from "@/infrastructure/supabase/clients";

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

async function resolveSession(request: Request) {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) return null;

  const { data, error } = await createSupabasePublicClient().auth.getUser(accessToken);
  if (error || !data.user) return null;

  return { user: data.user, accessToken, supabase: createSupabaseUserClient(accessToken) };
}

const unauthorized = { error: "Unauthorized." } as const;
const forbidden = { error: "Forbidden." } as const;

export const authPlugin = new Elysia({ name: "supabase-auth" }).macro({
  auth: {
    async resolve({ request, status }) {
      const session = await resolveSession(request);
      if (!session) return status(401, unauthorized);

      return session;
    },
  },
  admin: {
    async resolve({ request, status }) {
      const session = await resolveSession(request);
      if (!session) return status(401, unauthorized);

      const profile = await new SupabaseUserRepository(session.supabase).findById(session.user.id);
      if (profile?.role !== "admin") return status(403, forbidden);

      return { ...session, profile };
    },
  },
});
