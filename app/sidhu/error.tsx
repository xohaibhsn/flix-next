"use client";

import { useEffect } from "react";

export default function SidhuError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    const digest = error.digest ? ` digest=${error.digest}` : "";
    console.error(`[sidhu] page error${digest}`);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-bold text-ink">This page could not load</h1>
      <p className="mt-3 text-sm text-muted">
        A server error occurred while loading this Sidhu screen. Check Hostinger Runtime logs for a
        line starting with <code className="rounded bg-paper px-1">[sidhu]</code>
        {error.digest ? (
          <>
            {" "}
            or digest <code className="rounded bg-paper px-1">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
