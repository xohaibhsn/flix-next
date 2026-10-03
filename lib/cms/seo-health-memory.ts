import { createHash } from "node:crypto";
import type {
  SeoHealthFinding,
  SeoHealthSeverity,
  SeoHealthSource,
} from "@/lib/cms/seo-health";

export const SEO_HEALTH_STATE_VERSION = 1 as const;
export const SEO_HEALTH_STATE_KEY = "seo_health_state_v1";
export const SEO_HEALTH_MAX_SNAPSHOT_FINDINGS = 400;
export const SEO_HEALTH_MAX_ACCEPTED = 400;

export type SeoHealthWorkflowStatus = "new" | "existing" | "resolved" | "accepted";

export type SeoHealthFindingIdentity = {
  fingerprint: string;
  source: SeoHealthSource;
  issueCode: string;
  severity: SeoHealthSeverity;
  entityType: string;
  entityId: string;
  entityLabel: string;
  publicUrl: string;
  title: string;
};

export type SeoHealthAcceptedEntry = SeoHealthFindingIdentity & {
  acceptedAt: string;
};

export type SeoHealthStateV1 = {
  version: typeof SEO_HEALTH_STATE_VERSION;
  lastScanAt: string | null;
  previousScanAt: string | null;
  currentFindings: SeoHealthFindingIdentity[];
  previousFindings: SeoHealthFindingIdentity[];
  accepted: Record<string, SeoHealthAcceptedEntry>;
};

export type SeoHealthAnnotatedFinding = {
  finding: SeoHealthFinding;
  fingerprint: string;
  status: Exclude<SeoHealthWorkflowStatus, "resolved">;
};

export type SeoHealthWorkflowView = {
  annotated: SeoHealthAnnotatedFinding[];
  open: SeoHealthAnnotatedFinding[];
  accepted: SeoHealthAnnotatedFinding[];
  resolved: SeoHealthFindingIdentity[];
  counts: {
    new: number;
    existing: number;
    open: number;
    resolved: number;
    accepted: number;
  };
  hasBaseline: boolean;
};

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export function emptySeoHealthState(): SeoHealthStateV1 {
  return {
    version: SEO_HEALTH_STATE_VERSION,
    lastScanAt: null,
    previousScanAt: null,
    currentFindings: [],
    previousFindings: [],
    accepted: {},
  };
}

export function isValidSeoHealthFingerprint(value: string) {
  return FINGERPRINT_PATTERN.test(value);
}

function evidenceValue(finding: SeoHealthFinding, prefix: string) {
  const line = finding.evidence.find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

/** Material content used so acceptance invalidates when the underlying value changes. */
export function seoHealthContentSignature(finding: SeoHealthFinding): string {
  const code = finding.issueCode;
  if (finding.source === "metadata") {
    if (code.includes("TITLE")) {
      return `title:${evidenceValue(finding, "Search title:")}`;
    }
    if (code.includes("DESCRIPTION")) {
      return `description:${evidenceValue(finding, "Description:")}|len:${evidenceValue(finding, "Description length:")}`;
    }
    if (code.includes("CANONICAL") || code === "INDEXABLE_TO_OTHER_CANONICAL" || code === "NOINDEX_SITEMAP_INCLUDED") {
      return `canonical:${evidenceValue(finding, "Canonical:")}|indexing:${evidenceValue(finding, "Indexing:")}`;
    }
    return [
      evidenceValue(finding, "Search title:"),
      evidenceValue(finding, "Description:"),
      evidenceValue(finding, "Canonical:"),
      evidenceValue(finding, "Indexing:"),
    ].join("|");
  }
  if (finding.source === "internal-link") {
    return [
      evidenceValue(finding, "Stored link:"),
      evidenceValue(finding, "Final target:"),
      evidenceValue(finding, "Link text:"),
    ].join("|");
  }
  if (finding.source === "image") {
    const rendered =
      finding.evidence.find((item) => item.startsWith("Rendered alt:")) ||
      finding.evidence.find((item) => item.startsWith("Alt attribute")) ||
      finding.evidence.find((item) => item.startsWith("Rendered alt "));
    return [
      evidenceValue(finding, "Image:"),
      evidenceValue(finding, "Saved media alt:"),
      rendered || "",
      finding.imageAltStatus || "",
    ].join("|");
  }
  return "";
}

export function seoHealthFindingFingerprint(finding: SeoHealthFinding): string {
  const material = [
    finding.source,
    finding.issueCode,
    finding.entity.type,
    finding.entity.id,
    finding.publicUrl || "",
    seoHealthContentSignature(finding),
  ].join("\n");
  return createHash("sha256").update(material).digest("hex");
}

export function toSeoHealthFindingIdentity(finding: SeoHealthFinding): SeoHealthFindingIdentity {
  return {
    fingerprint: seoHealthFindingFingerprint(finding),
    source: finding.source,
    issueCode: finding.issueCode,
    severity: finding.severity,
    entityType: finding.entity.type,
    entityId: finding.entity.id,
    entityLabel: finding.entity.label,
    publicUrl: finding.publicUrl,
    title: finding.title,
  };
}

export function canAcceptSeoHealthFinding(finding: Pick<SeoHealthFinding, "severity" | "action">) {
  return (
    (finding.severity === "editorial" || finding.severity === "review") &&
    finding.action !== "required"
  );
}

function boundIdentities(items: SeoHealthFindingIdentity[]) {
  return items.slice(0, SEO_HEALTH_MAX_SNAPSHOT_FINDINGS);
}

function boundAccepted(accepted: Record<string, SeoHealthAcceptedEntry>) {
  const entries = Object.values(accepted).sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt));
  if (entries.length <= SEO_HEALTH_MAX_ACCEPTED) return accepted;
  const next: Record<string, SeoHealthAcceptedEntry> = {};
  for (const entry of entries.slice(0, SEO_HEALTH_MAX_ACCEPTED)) {
    next[entry.fingerprint] = entry;
  }
  return next;
}

export function sanitizeSeoHealthState(value: unknown): SeoHealthStateV1 {
  const empty = emptySeoHealthState();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Partial<SeoHealthStateV1>;
  if (raw.version !== SEO_HEALTH_STATE_VERSION) return empty;

  const accepted: Record<string, SeoHealthAcceptedEntry> = {};
  if (raw.accepted && typeof raw.accepted === "object") {
    for (const [key, entry] of Object.entries(raw.accepted)) {
      if (!isValidSeoHealthFingerprint(key) || !entry || typeof entry !== "object") continue;
      if (!isValidSeoHealthFingerprint(entry.fingerprint)) continue;
      accepted[key] = {
        fingerprint: entry.fingerprint,
        source: entry.source,
        issueCode: String(entry.issueCode || ""),
        severity: entry.severity,
        entityType: String(entry.entityType || ""),
        entityId: String(entry.entityId || ""),
        entityLabel: String(entry.entityLabel || ""),
        publicUrl: String(entry.publicUrl || ""),
        title: String(entry.title || ""),
        acceptedAt: String(entry.acceptedAt || ""),
      };
    }
  }

  const asIdentity = (item: unknown): SeoHealthFindingIdentity | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as SeoHealthFindingIdentity;
    if (!isValidSeoHealthFingerprint(row.fingerprint)) return null;
    return {
      fingerprint: row.fingerprint,
      source: row.source,
      issueCode: String(row.issueCode || ""),
      severity: row.severity,
      entityType: String(row.entityType || ""),
      entityId: String(row.entityId || ""),
      entityLabel: String(row.entityLabel || ""),
      publicUrl: String(row.publicUrl || ""),
      title: String(row.title || ""),
    };
  };

  return {
    version: SEO_HEALTH_STATE_VERSION,
    lastScanAt: typeof raw.lastScanAt === "string" ? raw.lastScanAt : null,
    previousScanAt: typeof raw.previousScanAt === "string" ? raw.previousScanAt : null,
    currentFindings: boundIdentities((Array.isArray(raw.currentFindings) ? raw.currentFindings : []).map(asIdentity).filter(Boolean) as SeoHealthFindingIdentity[]),
    previousFindings: boundIdentities((Array.isArray(raw.previousFindings) ? raw.previousFindings : []).map(asIdentity).filter(Boolean) as SeoHealthFindingIdentity[]),
    accepted: boundAccepted(accepted),
  };
}

export function estimateSeoHealthStateBytes(state: SeoHealthStateV1) {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

/**
 * Compare the current scan against the previously persisted snapshot.
 * First scan (no lastScanAt): all open findings are NEW.
 */
export function buildSeoHealthWorkflow(
  findings: SeoHealthFinding[],
  state: SeoHealthStateV1 | null | undefined,
): SeoHealthWorkflowView {
  const safe = state ? sanitizeSeoHealthState(state) : emptySeoHealthState();
  const hasBaseline = Boolean(safe.lastScanAt);
  const priorFingerprints = new Set(safe.currentFindings.map((item) => item.fingerprint));

  const annotated: SeoHealthAnnotatedFinding[] = findings.map((finding) => {
    const fingerprint = seoHealthFindingFingerprint(finding);
    const acceptedEntry = safe.accepted[fingerprint];
    if (acceptedEntry && canAcceptSeoHealthFinding(finding)) {
      return { finding, fingerprint, status: "accepted" };
    }
    const status = hasBaseline && priorFingerprints.has(fingerprint) ? "existing" : "new";
    return { finding, fingerprint, status };
  });

  const currentFingerprints = new Set(annotated.map((item) => item.fingerprint));
  const resolved = hasBaseline
    ? safe.currentFindings.filter((item) => !currentFingerprints.has(item.fingerprint))
    : [];

  const open = annotated.filter((item) => item.status === "new" || item.status === "existing");
  const accepted = annotated.filter((item) => item.status === "accepted");

  return {
    annotated,
    open,
    accepted,
    resolved,
    counts: {
      new: annotated.filter((item) => item.status === "new").length,
      existing: annotated.filter((item) => item.status === "existing").length,
      open: open.length,
      resolved: resolved.length,
      accepted: accepted.length,
    },
    hasBaseline,
  };
}

/** Advance snapshot memory after a successful scan. Does not mutate accepted entries that still match. */
export function applySeoHealthScanSnapshot(
  state: SeoHealthStateV1 | null | undefined,
  findings: SeoHealthFinding[],
  scannedAt: string,
): SeoHealthStateV1 {
  const previous = sanitizeSeoHealthState(state);
  const currentFindings = boundIdentities(findings.map(toSeoHealthFindingIdentity));
  const currentFingerprints = new Set(currentFindings.map((item) => item.fingerprint));
  const retainedAccepted: Record<string, SeoHealthAcceptedEntry> = {};

  for (const [fingerprint, entry] of Object.entries(previous.accepted)) {
    // Keep acceptance while the exact fingerprint still exists, or for one lag scan after resolve.
    if (currentFingerprints.has(fingerprint) || previous.currentFindings.some((item) => item.fingerprint === fingerprint)) {
      retainedAccepted[fingerprint] = entry;
    }
  }

  return {
    version: SEO_HEALTH_STATE_VERSION,
    lastScanAt: scannedAt,
    previousScanAt: previous.lastScanAt,
    previousFindings: boundIdentities(previous.currentFindings),
    currentFindings,
    accepted: boundAccepted(retainedAccepted),
  };
}

export function acceptSeoHealthFindingInState(
  state: SeoHealthStateV1,
  fingerprint: string,
  acceptedAt: string,
): { ok: true; state: SeoHealthStateV1 } | { ok: false; error: string } {
  if (!isValidSeoHealthFingerprint(fingerprint)) {
    return { ok: false, error: "Invalid finding reference." };
  }
  const safe = sanitizeSeoHealthState(state);
  const identity = safe.currentFindings.find((item) => item.fingerprint === fingerprint);
  if (!identity) {
    return { ok: false, error: "That finding is not in the latest SEO Health scan." };
  }
  if (identity.severity === "needs-attention" || identity.severity === "healthy") {
    return { ok: false, error: "Needs Attention items cannot be dismissed as no action." };
  }
  if (identity.severity !== "editorial" && identity.severity !== "review") {
    return { ok: false, error: "Only review and editorial suggestions can be marked as no action." };
  }

  return {
    ok: true,
    state: {
      ...safe,
      accepted: boundAccepted({
        ...safe.accepted,
        [fingerprint]: { ...identity, acceptedAt },
      }),
    },
  };
}

export function reopenSeoHealthFindingInState(
  state: SeoHealthStateV1,
  fingerprint: string,
): { ok: true; state: SeoHealthStateV1 } | { ok: false; error: string } {
  if (!isValidSeoHealthFingerprint(fingerprint)) {
    return { ok: false, error: "Invalid finding reference." };
  }
  const safe = sanitizeSeoHealthState(state);
  if (!safe.accepted[fingerprint]) {
    return { ok: false, error: "That finding is not marked as reviewed." };
  }
  const accepted = { ...safe.accepted };
  delete accepted[fingerprint];
  return { ok: true, state: { ...safe, accepted } };
}
