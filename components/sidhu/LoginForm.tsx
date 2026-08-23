"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/auth/actions";
import { Banner, inputClass } from "@/components/sidhu/fields";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <label className="block">
        <span className="text-xs font-semibold tracking-wide text-ink/70 uppercase">Username</span>
        <input
          className={`${inputClass} mt-1.5`}
          name="username"
          type="text"
          autoComplete="username"
          required
          disabled={pending}
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold tracking-wide text-ink/70 uppercase">Password</span>
        <input
          className={`${inputClass} mt-1.5`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
