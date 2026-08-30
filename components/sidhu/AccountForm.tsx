"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction, type FormState } from "@/lib/auth/actions";
import { Banner } from "@/components/sidhu/fields";
import { PasswordField } from "@/components/sidhu/PasswordField";
import { useAdminSession } from "@/components/sidhu/AdminSessionProvider";
import { ROLE_LABELS } from "@/lib/auth/permissions";

const initial: FormState = {};

export function AccountForm() {
  const session = useAdminSession();
  const [state, action, pending] = useActionState(changeOwnPasswordAction, initial);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-5">
        <p className="text-sm font-semibold">Signed in as</p>
        <p className="mt-2 text-sm">{session?.displayName || session?.username}</p>
        <p className="text-xs text-muted">
          {session?.username} · {session ? ROLE_LABELS[session.role] : ""}
        </p>
      </section>
      <form action={action} className="space-y-4 rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Change password</h2>
        <p className="text-sm text-muted">
          Use at least 12 characters with upper, lower, number, and symbol. You will need to sign in again.
        </p>
        {state.error ? <Banner tone="error">{state.error}</Banner> : null}
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField name="newPassword" label="New password" autoComplete="new-password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
