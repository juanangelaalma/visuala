import { Elysia, t } from "elysia";
import { loginWithEmail } from "@/application/auth/login-with-email";
import { loginWithGoogle } from "@/application/auth/login-with-google";
import { registerWithEmail } from "@/application/auth/register-with-email";
import { resendConfirmationEmail } from "@/application/auth/resend-confirmation-email";
import { createAuthServices } from "@/application/auth/services";
import { ensureUserProfile } from "@/application/auth/ensure-user-profile";
import { AuthDomainError } from "@/domain/auth/errors";
import { getEnv } from "@/env";
import { toAuthUser } from "@/infrastructure/auth/map-auth-user";
import { SupabaseUserRepository } from "@/infrastructure/auth/supabase-user-repository";
import { authPlugin } from "@/plugins/supabase";
import { loginBodySchema, registerBodySchema, resendConfirmationBodySchema } from "@/schemas/auth";

const invalidRequest = { error: "Invalid request." } as const;
const jsonBody = { body: t.Unknown() } as const;

export const authRoutes = new Elysia({ name: "auth-routes" })
  .use(authPlugin)
  .post(
    "/auth/register",
    async ({ body, status }) => {
      const parsed = registerBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const services = createAuthServices();
      const result = await registerWithEmail(services, parsed.data);
      await resendConfirmationEmail(services.authProvider, { email: parsed.data.email }).catch(() => undefined);

      if (!result) return { user: null, profile: null, session: null };

      return { user: result.user, profile: result.profile, session: result.session };
    },
    { ...jsonBody, detail: { tags: ["auth"] } },
  )
  .post(
    "/auth/login",
    async ({ body, status }) => {
      const parsed = loginBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const result = await loginWithEmail(createAuthServices(), parsed.data);
      if (!result) return status(401, { error: "Invalid email or password." });

      return { user: result.user, profile: result.profile, session: result.session };
    },
    { ...jsonBody, detail: { tags: ["auth"] } },
  )
  .post(
    "/auth/resend-confirmation",
    async ({ body, status }) => {
      const parsed = resendConfirmationBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      try {
        await resendConfirmationEmail(createAuthServices().authProvider, parsed.data);
      } catch (error) {
        if (error instanceof AuthDomainError && error.code === "rate_limited") throw error;
      }

      return { message: "If an account exists, we sent a confirmation email." };
    },
    { ...jsonBody, detail: { tags: ["auth"] } },
  )
  .post(
    "/auth/oauth/google",
    async () => {
      const url = await loginWithGoogle(createAuthServices().authProvider, `${getEnv().APP_URL}/auth/callback`);

      return { url };
    },
    { detail: { tags: ["auth"] } },
  )
  .post(
    "/auth/sync-profile",
    async ({ status, supabase, user }) => {
      const authUser = toAuthUser(user);
      if (!authUser) return status(401, { error: "Unauthorized." });

      const profile = await ensureUserProfile(new SupabaseUserRepository(supabase), authUser);

      return { user: authUser, profile };
    },
    { auth: true, detail: { tags: ["auth"] } },
  );
