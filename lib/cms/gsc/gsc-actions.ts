"use server";

import { requireAdminActor } from "@/lib/auth/guards";
import { probeGscConnection, type GscProbeResult } from "@/lib/cms/gsc/probe";

export type ProbeGscConnectionActionResult =
  | { ok: true; probe: GscProbeResult }
  | { ok: false; code: "unauthorized"; error: string };

/**
 * Explicit admin-only GSC connection probe.
 * SEO permission required. No AI research. No CMS writes. No persistence.
 */
export async function probeGscConnectionAction(): Promise<ProbeGscConnectionActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, code: "unauthorized", error: actor.error };
  }

  const probe = await probeGscConnection();
  return { ok: true, probe };
}
