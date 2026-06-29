import { Button } from "@visuala/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { resendConfirmationAction } from "@/features/auth/actions/auth-actions";
import { CheckEmailBackground } from "./CheckEmailBackground";
import { ResendConfirmationForm } from "./ResendConfirmationForm";

type CheckEmailPageProps = {
  searchParams: Promise<{ email?: string }>;
};

export default async function CheckEmailPage({ searchParams }: CheckEmailPageProps) {
  const [{ email }, { authProvider }] = await Promise.all([searchParams, createAuthServices()]);
  const user = await getCurrentUser(authProvider);

  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-bg px-6 py-8 text-white">
      <CheckEmailBackground />
      <div className="absolute inset-0 bg-black/60" />
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center lg:justify-between">
        <section className="hidden max-w-xl lg:block">
          <p className="mb-5 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-450">Visuala AI</p>
          <h1 className="font-display text-6xl font-semibold leading-[0.95] tracking-[-0.04em]">One more step before your creative workspace opens.</h1>
          <p className="mt-6 max-w-md font-sans-secondary text-lg leading-8 text-neutral-450">Confirm your email to keep your account secure and start generating premium visuals.</p>
        </section>

        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-pricing-bg/90 p-6 shadow-card-inner backdrop-blur sm:p-8">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-2xl text-primary">@</div>
          <p className="text-sm font-semibold text-primary">Check your inbox</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Confirm your email</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-450">
            We sent a confirmation link{email ? " to " : " to your email"}
            {email ? <span className="font-semibold text-white"> {email}</span> : null}. Click the link to activate your account before logging in.
          </p>

          <p className="mt-5 text-sm leading-6 text-neutral-500">If you do not see it, check your spam or promotions folder. The link may take a minute to arrive.</p>

          <ResendConfirmationForm action={resendConfirmationAction} email={email} />

          <Button href="/login" className="mt-6 h-12 w-full px-0 py-0 text-sm">
            Go to login
          </Button>

          <p className="mt-6 text-center text-sm text-neutral-450">
            Wrong email?{" "}
            <Link href="/register" className="font-semibold text-primary hover:text-primary-dark">
              Create a new account
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
