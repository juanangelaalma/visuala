"use client";

import { Button } from "@visuala/ui";
import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import type { AuthActionState } from "../actions/auth-actions";
import Hyperspeed, { hyperspeedPresetThree } from "./Hyperspeed";

type AuthFormProps = {
  mode: "login" | "register";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  googleAction: (formData: FormData) => Promise<void>;
  initialError?: string;
  redirectPath?: string;
};

const initialState: AuthActionState = {};

export function AuthForm({ mode, action, googleAction, initialError, redirectPath }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isLogin = mode === "login";
  const error = state.error ?? initialError;

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-bg px-6 py-8 text-white">
      <Hyperspeed effectOptions={hyperspeedPresetThree} />
      <div className="absolute inset-0 bg-black/60" />
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center lg:justify-between">
        <section className="hidden max-w-xl lg:block">
          <p className="mb-5 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-450">Visuala AI</p>
          <h1 className="font-display text-6xl font-semibold leading-[0.95] tracking-[-0.04em]">Create product visuals, UGC videos, and fashion campaigns with AI.</h1>
          <p className="mt-6 max-w-md font-sans-secondary text-lg leading-8 text-neutral-450">Premium creative generation workspace for brands, creators, and affiliate teams.</p>
        </section>

        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-pricing-bg/90 p-6 shadow-card-inner backdrop-blur sm:p-8">
          <div className="mb-8">
            <p className="text-sm font-semibold text-primary">{isLogin ? "Welcome back" : "Start creating"}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{isLogin ? "Log in to Visuala" : "Create your account"}</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-450">{isLogin ? "Access your AI creative dashboard." : "Create your account, then confirm your email to start using Visuala."}</p>
          </div>

          <form action={googleAction}>
            {redirectPath ? <input type="hidden" name="next" value={redirectPath} /> : null}
            <Button type="submit" variant="solid" className="h-12 w-full gap-3 border border-white/10 px-0 py-0 text-sm hover:bg-google-hover!">
              <Image src="/google-logo.png" alt="" width={20} height={20} aria-hidden />
              Continue with Google
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form action={formAction} className="space-y-4">
            {redirectPath ? <input type="hidden" name="next" value={redirectPath} /> : null}
            {!isLogin ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-neutral-450">Full name</span>
                <input name="fullName" autoComplete="name" className="h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" placeholder="Jane Creator" />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-450">Email</span>
              <input name="email" type="email" autoComplete="email" required className="h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" placeholder="you@brand.com" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-450">Password</span>
              <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={8} className="h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-white outline-none transition placeholder:text-neutral-650 focus:border-primary" placeholder="At least 8 characters" />
            </label>

            {error ? <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-white">{error}</p> : null}

            <Button type="submit" disabled={pending} className="h-12 w-full px-0 py-0 text-sm disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? "Please wait..." : isLogin ? "Log in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-450">
            {isLogin ? "No account yet? " : "Already have an account? "}
            <Link href={isLogin ? "/register" : "/login"} className="font-semibold text-primary hover:text-primary-dark">
              {isLogin ? "Register" : "Log in"}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
