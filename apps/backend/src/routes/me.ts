import { Elysia } from "elysia";
import { getCreditBalance } from "@/application/credits/get-credit-balance";
import { createCreditServices } from "@/application/credits/services";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { toAuthUser } from "@/infrastructure/auth/map-auth-user";
import { authPlugin } from "@/plugins/supabase";

export const meRoutes = new Elysia({ name: "me-routes" })
  .use(authPlugin)
  .get(
    "/me",
    async ({ user, supabase, status }) => {
      const authUser = toAuthUser(user);
      if (!authUser) return status(401, { error: "Unauthorized." });

      const profile = await new SupabaseUserRepository(supabase).findById(authUser.id);

      return { user: authUser, profile };
    },
    { auth: true, detail: { tags: ["me"] } },
  )
  .get(
    "/me/credits",
    async ({ user, supabase }) => {
      const { creditRepository } = createCreditServices(supabase);

      return { balance: await getCreditBalance(creditRepository, user.id) };
    },
    { auth: true, detail: { tags: ["me"] } },
  );
