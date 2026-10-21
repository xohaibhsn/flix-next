"use client";

import { useActionState } from "react";
import {
  runDbIdentityDiagnosticAction,
  type DbIdentityDiagnosticActionState,
} from "@/lib/cms/seo-experiment-ledger/db-identity-diagnostic-action";
import { Banner } from "@/components/sidhu/fields";
import { formatLedgerMysqlUtcLabel } from "@/lib/cms/seo-experiment-ledger/read-cursor";

const INITIAL_ACTION_STATE: DbIdentityDiagnosticActionState = { status: "idle" };

function SnapshotTable({ state }: { state: Extract<DbIdentityDiagnosticActionState, { status: "ok" }> }) {
  const s = state.snapshot;
  const rows: Array<[string, string]> = [
    ["Configured DB host", s.configuredHost],
    ["Configured DB port", String(s.configuredPort)],
    ["Connected server hostname", s.serverHostname],
    ["Connected server port", String(s.serverPort)],
    ["Selected database", s.selectedDatabase],
    ["Server ID", s.serverId],
    ["Total Research runs", String(s.totalRuns)],
    ["Latest Research created_at", formatLedgerMysqlUtcLabel(s.latestCreatedAt)],
    ["October 20 Research present", s.oct20RunPresent ? "yes" : "no"],
  ];

  return (
    <dl className="mt-4 divide-y divide-line rounded-md border border-line bg-admin-surface">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="text-xs font-semibold tracking-wide text-ink/70 uppercase">{label}</dt>
          <dd className="font-mono text-sm text-ink break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DbIdentityDiagnosticPanel({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(
    runDbIdentityDiagnosticAction,
    INITIAL_ACTION_STATE,
  );

  if (!enabled) {
    return (
      <Banner tone="warning">
        Database identity diagnostic is disabled (
        <code className="font-mono text-xs">FLIX_DB_IDENTITY_DIAGNOSTIC_ENABLED</code> is not{" "}
        <code className="font-mono text-xs">true</code>).
      </Banner>
    );
  }

  return (
    <div className="space-y-4">
      <Banner tone="warning">
        This samples one connection borrowed from the current serving application&apos;s MySQL
        pool. It does not automatically prove that every Node worker uses the same backend.
      </Banner>

      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Sampling…" : "Run database identity sample"}
        </button>
      </form>

      {state.status === "error" ? <Banner tone="error">{state.errorMessage}</Banner> : null}
      {state.status === "ok" ? <SnapshotTable state={state} /> : null}
    </div>
  );
}
