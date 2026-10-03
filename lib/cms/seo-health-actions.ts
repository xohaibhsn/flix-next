"use server";

import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth/guards";
import {
  acceptSeoHealthFindingInState,
  isValidSeoHealthFingerprint,
  reopenSeoHealthFindingInState,
} from "@/lib/cms/seo-health-memory";
import { getSeoHealthState, saveSeoHealthState } from "@/lib/cms/seo-health-state";
import { publicErrorMessage } from "@/lib/security/errors";

function isNextRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function fingerprintFromForm(formData: FormData) {
  return String(formData.get("fingerprint") || "").trim();
}

export async function acceptSeoHealthFindingAction(formData: FormData): Promise<void> {
  const unauthorized = await requireAdminAction("seo");
  if (unauthorized) {
    throw new Error(unauthorized.error);
  }
  const fingerprint = fingerprintFromForm(formData);
  if (!isValidSeoHealthFingerprint(fingerprint)) {
    throw new Error("Invalid finding reference.");
  }

  try {
    const state = await getSeoHealthState();
    const result = acceptSeoHealthFindingInState(state, fingerprint, new Date().toISOString());
    if (!result.ok) throw new Error(result.error);
    await saveSeoHealthState(result.state);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    throw new Error(publicErrorMessage(error, "Could not mark this finding as reviewed."));
  }

  redirect("/sidhu/seo/health/?run=1");
}

export async function reopenSeoHealthFindingAction(formData: FormData): Promise<void> {
  const unauthorized = await requireAdminAction("seo");
  if (unauthorized) {
    throw new Error(unauthorized.error);
  }
  const fingerprint = fingerprintFromForm(formData);
  if (!isValidSeoHealthFingerprint(fingerprint)) {
    throw new Error("Invalid finding reference.");
  }

  try {
    const state = await getSeoHealthState();
    const result = reopenSeoHealthFindingInState(state, fingerprint);
    if (!result.ok) throw new Error(result.error);
    await saveSeoHealthState(result.state);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    throw new Error(publicErrorMessage(error, "Could not reopen this finding."));
  }

  redirect("/sidhu/seo/health/?run=1");
}
