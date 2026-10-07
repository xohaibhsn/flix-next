/**
 * Refresh-First Governor V1 — pure evaluate().
 * Input → serializable result. Zero writes, zero providers, zero network.
 *
 * Precedence (deterministic):
 * 1. authoritative targetPostId → REFRESH_EXISTING
 * 2. exact slug / public URL / canonical → REFRESH (or fail-closed if ambiguous)
 * 3. strong supplied CURRENT_CMS GSC ownership → REFRESH
 * 4. eligible historical candidate → blocks PASS (UNKNOWN / non-PASS)
 * 5. ≥2 plausible current targets → CANNIBALIZATION_RISK
 * 6. duplicate without clear target → DUPLICATE
 * 7. AI existingCoverage supporting only
 * 8. insufficient proof → UNKNOWN
 * 9. clear absence + material evidence + complete corpus → PASS_NEW_CONTENT
 *
 * Draft slug reservation: REFRESH when draft is the clear target; else blocks PASS.
 * Planning reservation (supplied keys only): blocks PASS → DUPLICATE / UNKNOWN.
 * Published clear target outranks weaker draft/planning reservation.
 */

import { createHash } from "node:crypto";
import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import {
  blogPostPath,
  migratePublicBlogPath,
} from "@/lib/cms/blog-paths";
import { withSlash } from "@/lib/cms/redirects";
import { slugify } from "@/lib/cms/slug";
import {
  SEO_REFRESH_FIRST_CAPS,
  type SeoRefreshFirstConfidence,
  type SeoRefreshFirstCorpusCandidate,
  type SeoRefreshFirstCoverage,
  type SeoRefreshFirstEvidence,
  type SeoRefreshFirstGscOwnershipEvidence,
  type SeoRefreshFirstHistoricalCandidate,
  type SeoRefreshFirstHistoricalOutput,
  type SeoRefreshFirstInput,
  type SeoRefreshFirstResult,
  type SeoRefreshFirstTarget,
} from "@/lib/cms/seo-refresh-first/types";
import type { SeoRefreshFirstVerdict } from "@/lib/cms/seo-next-best-action/types";

function trimText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function hasMaterialNarrative(value: unknown): boolean {
  const text = trimText(value, 400);
  if (text.length < 12) return false;
  if (/^(n\/?a|none|tbd|todo|placeholder|-|—)$/i.test(text)) return false;
  return true;
}

function normalizeSlug(value: unknown): string {
  const raw = trimText(value, SEO_REFRESH_FIRST_CAPS.slug);
  if (!raw) return "";
  // Already slug-like → still run through slugify for consistency
  return slugify(raw);
}

function normalizePathKey(value: unknown): string {
  const raw = trimText(value, SEO_REFRESH_FIRST_CAPS.url);
  if (!raw) return "";
  const fromPublic = normalizePublicPath(raw);
  const path = fromPublic || (raw.startsWith("/") ? withSlash(raw.split("?")[0]?.split("#")[0] || "/") : "");
  if (!path) return "";
  return withSlash(migratePublicBlogPath(path));
}

function isPublishedStatus(status: unknown): boolean {
  return String(status || "").toLowerCase() === "published";
}

function isDraftStatus(status: unknown): boolean {
  return String(status || "").toLowerCase() === "draft";
}

function boundCandidates(
  list: SeoRefreshFirstCorpusCandidate[] | undefined,
): SeoRefreshFirstCorpusCandidate[] {
  const out: SeoRefreshFirstCorpusCandidate[] = [];
  for (const c of list || []) {
    if (out.length >= SEO_REFRESH_FIRST_CAPS.maxCandidates) break;
    const postId = trimText(c?.postId, SEO_REFRESH_FIRST_CAPS.postId);
    if (!postId) continue;
    const publicUrl = normalizePathKey(c.publicUrl) || trimText(c.publicUrl, SEO_REFRESH_FIRST_CAPS.url);
    if (!publicUrl) continue;
    out.push({
      postId,
      publicUrl,
      title: trimText(c.title, SEO_REFRESH_FIRST_CAPS.title) || undefined,
      slug: normalizeSlug(c.slug) || undefined,
      seoTitle: trimText(c.seoTitle, SEO_REFRESH_FIRST_CAPS.title) || undefined,
      canonicalUrl: normalizePathKey(c.canonicalUrl) || undefined,
      status: c.status,
      categoryName: trimText(c.categoryName, 80) || undefined,
      excerpt: trimText(c.excerpt, SEO_REFRESH_FIRST_CAPS.excerpt) || undefined,
    });
  }
  return out;
}

function boundGsc(
  list: SeoRefreshFirstGscOwnershipEvidence[] | undefined,
): SeoRefreshFirstGscOwnershipEvidence[] {
  const out: SeoRefreshFirstGscOwnershipEvidence[] = [];
  for (const row of list || []) {
    if (out.length >= SEO_REFRESH_FIRST_CAPS.maxGscEvidence) break;
    const normalizedPath = normalizePathKey(row?.normalizedPath);
    if (!normalizedPath) continue;
    out.push({
      normalizedPath,
      classification: trimText(row.classification, 40),
      ownsRelatedQueryPage: Boolean(row.ownsRelatedQueryPage),
      evidenceId: trimText(row.evidenceId, SEO_REFRESH_FIRST_CAPS.evidenceId) || undefined,
      relatedPostId: trimText(row.relatedPostId, SEO_REFRESH_FIRST_CAPS.postId) || undefined,
    });
  }
  return out;
}

function boundKeys(list: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list || []) {
    if (out.length >= SEO_REFRESH_FIRST_CAPS.maxReservations) break;
    const key = normalizeSlug(raw) || trimText(raw, SEO_REFRESH_FIRST_CAPS.slug).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function topicKeyOf(input: SeoRefreshFirstInput): string {
  return normalizeSlug(input.opportunity?.topic) || "";
}

function proposedSlugOf(input: SeoRefreshFirstInput): string {
  const proposed = normalizeSlug(input.opportunity?.proposedSlug);
  if (proposed) return proposed;
  return topicKeyOf(input);
}

function coverageOf(input: SeoRefreshFirstInput): SeoRefreshFirstCoverage | null {
  const c = input.opportunity?.existingCoverage;
  if (c === "NONE" || c === "PARTIAL" || c === "STRONG") return c;
  return null;
}

function materialEvidenceOf(input: SeoRefreshFirstInput): boolean {
  const opp = input.opportunity;
  if (!opp) return false;
  const topicOk = hasMaterialNarrative(opp.topic) || hasMaterialNarrative(opp.workingTitle);
  if (!topicOk) return false;
  if (typeof opp.webEvidencePresent === "boolean" && opp.webEvidencePresent) return true;
  if (opp.gscOpportunityEvidencePresent) return true;
  if (hasMaterialNarrative(opp.webEvidence)) return true;
  if (hasMaterialNarrative(opp.whyNow)) return true;
  return false;
}

function materialTopicExists(input: SeoRefreshFirstInput): boolean {
  return (
    hasMaterialNarrative(input.opportunity?.topic) ||
    hasMaterialNarrative(input.opportunity?.workingTitle)
  );
}

function findByPostId(
  candidates: SeoRefreshFirstCorpusCandidate[],
  postId: string,
): SeoRefreshFirstCorpusCandidate | null {
  const id = trimText(postId, SEO_REFRESH_FIRST_CAPS.postId);
  if (!id) return null;
  return candidates.find((c) => c.postId === id) || null;
}

function uniqueByPostId(matches: SeoRefreshFirstCorpusCandidate[]): SeoRefreshFirstCorpusCandidate[] {
  const seen = new Set<string>();
  const out: SeoRefreshFirstCorpusCandidate[] = [];
  for (const m of matches) {
    if (seen.has(m.postId)) continue;
    seen.add(m.postId);
    out.push(m);
  }
  return out;
}

function preferPublished(matches: SeoRefreshFirstCorpusCandidate[]): SeoRefreshFirstCorpusCandidate[] {
  const published = matches.filter((m) => isPublishedStatus(m.status));
  if (published.length === 1) return published;
  if (published.length > 1) return published;
  return matches;
}

function targetFromCandidate(c: SeoRefreshFirstCorpusCandidate): SeoRefreshFirstTarget {
  return { postId: c.postId, publicUrl: c.publicUrl };
}

function eligibleHistorical(
  hist: SeoRefreshFirstHistoricalCandidate | null | undefined,
): SeoRefreshFirstHistoricalOutput | null {
  if (!hist) return null;
  const path = normalizePathKey(hist.path);
  if (!path || path === "/") return null;
  const classification = trimText(hist.classification, 40);
  // Redirected / current CMS historical URLs are not restoration candidates
  if (classification === "REDIRECTED_HISTORICAL" || classification === "CURRENT_CMS") {
    return null;
  }
  const restoreEligible = Boolean(hist.restoreEligible);
  const registryKey = trimText(hist.registryKey, SEO_REFRESH_FIRST_CAPS.registryKey);
  // Eligible = restoreEligible + registry-backed (key or REMOVED_OR_404 class)
  const classificationEligible =
    classification === "REMOVED_OR_404" || classification === "" || !classification;
  if (!restoreEligible) return null;
  if (!registryKey && classification !== "REMOVED_OR_404") return null;
  if (classification && !classificationEligible && classification !== "UNKNOWN") return null;

  return {
    path,
    registryKey: registryKey || undefined,
    classification: classification || undefined,
    restoreEligible: true,
    dispositionHint: trimText(hist.dispositionHint, 40) || undefined,
  };
}

function collectExactMatches(
  candidates: SeoRefreshFirstCorpusCandidate[],
  input: SeoRefreshFirstInput,
): {
  byPostId: SeoRefreshFirstCorpusCandidate | null;
  bySlug: SeoRefreshFirstCorpusCandidate[];
  byUrl: SeoRefreshFirstCorpusCandidate[];
  byCanonical: SeoRefreshFirstCorpusCandidate[];
} {
  const targetId = trimText(input.targetPostId, SEO_REFRESH_FIRST_CAPS.postId);
  const byPostId = targetId ? findByPostId(candidates, targetId) : null;

  const proposed = proposedSlugOf(input);
  const bySlug: SeoRefreshFirstCorpusCandidate[] = [];
  if (proposed) {
    for (const c of candidates) {
      const slug = c.slug || normalizeSlug(c.publicUrl.replace(/^\/blogs\//, "").replace(/\/$/, ""));
      if (slug && slug === proposed) bySlug.push(c);
    }
  }

  const matchedUrl = normalizePathKey(input.opportunity?.matchedPublicUrl);
  const proposedPath = proposed ? normalizePathKey(blogPostPath(proposed)) : "";
  const urlKeys = new Set<string>();
  if (matchedUrl) urlKeys.add(matchedUrl);
  if (proposedPath) urlKeys.add(proposedPath);

  const byUrl: SeoRefreshFirstCorpusCandidate[] = [];
  const byCanonical: SeoRefreshFirstCorpusCandidate[] = [];
  for (const c of candidates) {
    const pub = normalizePathKey(c.publicUrl);
    const can = normalizePathKey(c.canonicalUrl);
    if (pub && urlKeys.has(pub)) byUrl.push(c);
    if (can && urlKeys.has(can) && can !== pub) byCanonical.push(c);
    // matched URL equals this candidate's canonical even if public differs
    if (matchedUrl && can && matchedUrl === can && !byCanonical.includes(c) && !byUrl.includes(c)) {
      byCanonical.push(c);
    }
  }

  return { byPostId, bySlug: uniqueByPostId(bySlug), byUrl: uniqueByPostId(byUrl), byCanonical: uniqueByPostId(byCanonical) };
}

function gscOwnedTargets(
  candidates: SeoRefreshFirstCorpusCandidate[],
  gsc: SeoRefreshFirstGscOwnershipEvidence[],
): SeoRefreshFirstCorpusCandidate[] {
  const matches: SeoRefreshFirstCorpusCandidate[] = [];
  for (const row of gsc) {
    if (row.classification !== "CURRENT_CMS") continue;
    if (!row.ownsRelatedQueryPage) continue;
    if (row.relatedPostId) {
      const byId = findByPostId(candidates, row.relatedPostId);
      if (byId) matches.push(byId);
      continue;
    }
    for (const c of candidates) {
      const pub = normalizePathKey(c.publicUrl);
      const can = normalizePathKey(c.canonicalUrl);
      if (pub === row.normalizedPath || can === row.normalizedPath) {
        matches.push(c);
      }
    }
  }
  return uniqueByPostId(matches);
}

function reservationCollision(
  input: SeoRefreshFirstInput,
  candidates: SeoRefreshFirstCorpusCandidate[],
): {
  draftReservation: boolean;
  planningReservation: boolean;
  draftTarget: SeoRefreshFirstCorpusCandidate | null;
} {
  const proposed = proposedSlugOf(input);
  const topicKey = topicKeyOf(input);
  const draftSlugs = boundKeys(input.reservations?.draftSlugs);
  const draftTopics = boundKeys(input.reservations?.draftTopicKeys);
  const planSlugs = boundKeys(input.reservations?.reservedSlugs);
  const planTopics = boundKeys(input.reservations?.reservedTopicKeys);

  let draftReservation = false;
  let planningReservation = false;
  let draftTarget: SeoRefreshFirstCorpusCandidate | null = null;

  if (proposed && draftSlugs.includes(proposed)) draftReservation = true;
  if (topicKey && draftTopics.includes(topicKey)) draftReservation = true;
  if (proposed && planSlugs.includes(proposed)) planningReservation = true;
  if (topicKey && planTopics.includes(topicKey)) planningReservation = true;

  // Draft candidates in corpus with same slug also reserve
  if (proposed) {
    const draftHits = candidates.filter(
      (c) => isDraftStatus(c.status) && (c.slug === proposed || normalizePathKey(c.publicUrl) === normalizePathKey(blogPostPath(proposed))),
    );
    if (draftHits.length === 1) {
      draftReservation = true;
      draftTarget = draftHits[0];
    } else if (draftHits.length > 1) {
      draftReservation = true;
    }
  }

  return { draftReservation, planningReservation, draftTarget };
}

export function buildSeoRefreshFirstFingerprint(args: {
  verdict: SeoRefreshFirstVerdict;
  topic?: string;
  proposedSlug?: string;
  targetPostId?: string | null;
  targetPublicUrl?: string | null;
  historicalPath?: string | null;
  duplicate?: boolean;
  cannibalizationRisk?: boolean;
  exactPostMatch?: boolean;
  exactSlugMatch?: boolean;
  exactUrlMatch?: boolean;
  canonicalMatch?: boolean;
  gscOwnership?: boolean;
  draftReservation?: boolean;
  planningReservation?: boolean;
  existingCoverage?: SeoRefreshFirstCoverage | null;
  corpusComplete?: boolean;
}): string {
  const material = [
    "seo-refresh-first-v1",
    args.verdict,
    normalizeSlug(args.topic) || "",
    normalizeSlug(args.proposedSlug) || "",
    trimText(args.targetPostId, SEO_REFRESH_FIRST_CAPS.postId),
    normalizePathKey(args.targetPublicUrl) || "",
    normalizePathKey(args.historicalPath) || "",
    args.duplicate ? "1" : "0",
    args.cannibalizationRisk ? "1" : "0",
    args.exactPostMatch ? "1" : "0",
    args.exactSlugMatch ? "1" : "0",
    args.exactUrlMatch ? "1" : "0",
    args.canonicalMatch ? "1" : "0",
    args.gscOwnership ? "1" : "0",
    args.draftReservation ? "1" : "0",
    args.planningReservation ? "1" : "0",
    args.existingCoverage || "",
    args.corpusComplete ? "1" : "0",
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function finish(args: {
  verdict: SeoRefreshFirstVerdict;
  confidence: SeoRefreshFirstConfidence;
  target?: SeoRefreshFirstTarget;
  reason: string;
  evidence: Omit<SeoRefreshFirstEvidence, never>;
  historicalCandidate?: SeoRefreshFirstHistoricalOutput;
  topic: string;
  proposedSlug: string;
}): SeoRefreshFirstResult {
  const fingerprint = buildSeoRefreshFirstFingerprint({
    verdict: args.verdict,
    topic: args.topic,
    proposedSlug: args.proposedSlug,
    targetPostId: args.target?.postId,
    targetPublicUrl: args.target?.publicUrl,
    historicalPath: args.historicalCandidate?.path || args.evidence.historicalPath,
    duplicate: args.evidence.duplicate,
    cannibalizationRisk: args.evidence.cannibalizationRisk,
    exactPostMatch: args.evidence.exactPostMatch,
    exactSlugMatch: args.evidence.exactSlugMatch,
    exactUrlMatch: args.evidence.exactUrlMatch,
    canonicalMatch: args.evidence.canonicalMatch,
    gscOwnership: args.evidence.gscOwnership,
    draftReservation: args.evidence.draftReservation,
    planningReservation: args.evidence.planningReservation,
    existingCoverage: args.evidence.existingCoverage,
    corpusComplete: args.evidence.corpusComplete,
  });

  return {
    verdict: args.verdict,
    confidence: args.confidence,
    target: args.target,
    reason: trimText(args.reason, SEO_REFRESH_FIRST_CAPS.reason),
    evidence: args.evidence,
    historicalCandidate: args.historicalCandidate,
    fingerprint,
  };
}

/**
 * Evaluate Refresh-First eligibility for an opportunity.
 * Pure: no CMS/DB/Planning/GSC/provider calls.
 */
export function evaluateSeoRefreshFirst(input: SeoRefreshFirstInput = {}): SeoRefreshFirstResult {
  const candidates = boundCandidates(input.candidates);
  const gsc = boundGsc(input.gscOwnership);
  const topic = trimText(input.opportunity?.topic, SEO_REFRESH_FIRST_CAPS.topic);
  const proposedSlug = proposedSlugOf(input);
  const coverage = coverageOf(input);
  const corpusComplete = input.corpusComplete === true;
  const materialEvidence = materialEvidenceOf(input);
  const histOut = eligibleHistorical(input.historical);
  const exact = collectExactMatches(candidates, input);
  const gscTargets = gscOwnedTargets(candidates, gsc);
  const reservations = reservationCollision(input, candidates);
  const signalDuplicate = Boolean(input.signals?.duplicate);
  const signalCannibal = Boolean(input.signals?.cannibalizationRisk);

  const exactPostMatch = Boolean(exact.byPostId);
  const exactSlugMatch = exact.bySlug.length > 0;
  const exactUrlMatch = exact.byUrl.length > 0;
  const canonicalMatch = exact.byCanonical.length > 0;
  const gscOwnership = gscTargets.length > 0;

  // Union of deterministic current targets (for ambiguity detection)
  const deterministicPool = uniqueByPostId([
    ...(exact.byPostId ? [exact.byPostId] : []),
    ...exact.bySlug,
    ...exact.byUrl,
    ...exact.byCanonical,
    ...gscTargets,
  ]);

  const baseEvidence = (): SeoRefreshFirstEvidence => ({
    exactPostMatch,
    exactSlugMatch,
    exactUrlMatch,
    canonicalMatch,
    gscOwnership,
    historicalPath: histOut?.path || null,
    candidateCount: candidates.length,
    duplicate: signalDuplicate,
    cannibalizationRisk: signalCannibal,
    draftReservation: reservations.draftReservation,
    planningReservation: reservations.planningReservation,
    existingCoverage: coverage,
    corpusComplete,
    materialEvidence,
  });

  // --- 1. Authoritative targetPostId ---
  if (trimText(input.targetPostId, SEO_REFRESH_FIRST_CAPS.postId)) {
    if (exact.byPostId) {
      return finish({
        verdict: "REFRESH_EXISTING",
        confidence: "HIGH",
        target: targetFromCandidate(exact.byPostId),
        reason: "Authoritative targetPostId matches a current Blog candidate.",
        evidence: { ...baseEvidence(), exactPostMatch: true },
        historicalCandidate: histOut || undefined,
        topic,
        proposedSlug,
      });
    }
    // Declared target id but not in candidates → fail closed (do not PASS)
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "Authoritative targetPostId supplied but no matching corpus candidate.",
      evidence: { ...baseEvidence(), exactPostMatch: false },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // --- 2. Exact slug / URL / canonical ---
  const urlSlugCanonical = uniqueByPostId([
    ...exact.bySlug,
    ...exact.byUrl,
    ...exact.byCanonical,
  ]);
  const preferredExact = preferPublished(urlSlugCanonical);

  if (preferredExact.length > 1) {
    return finish({
      verdict: "CANNIBALIZATION_RISK",
      confidence: "HIGH",
      reason: "Multiple current Blog targets match the same slug/URL/canonical ownership.",
      evidence: {
        ...baseEvidence(),
        cannibalizationRisk: true,
        exactSlugMatch: exactSlugMatch || preferredExact.length > 0,
      },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  if (preferredExact.length === 1) {
    const t = preferredExact[0];
    return finish({
      verdict: "REFRESH_EXISTING",
      confidence: "HIGH",
      target: targetFromCandidate(t),
      reason: exactSlugMatch
        ? "Exact slug ownership of an existing BlogPost."
        : canonicalMatch && !exactUrlMatch
          ? "Canonical URL ownership of an existing BlogPost."
          : "Exact public URL ownership of an existing BlogPost.",
      evidence: {
        ...baseEvidence(),
        exactSlugMatch: exact.bySlug.some((c) => c.postId === t.postId),
        exactUrlMatch: exact.byUrl.some((c) => c.postId === t.postId),
        canonicalMatch: exact.byCanonical.some((c) => c.postId === t.postId),
      },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // --- 3. Strong GSC CURRENT_CMS ownership ---
  const preferredGsc = preferPublished(gscTargets);
  if (preferredGsc.length > 1) {
    return finish({
      verdict: "CANNIBALIZATION_RISK",
      confidence: "MEDIUM",
      reason: "Multiple CURRENT_CMS Blog targets own the related GSC query/page evidence.",
      evidence: { ...baseEvidence(), gscOwnership: true, cannibalizationRisk: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }
  if (preferredGsc.length === 1) {
    return finish({
      verdict: "REFRESH_EXISTING",
      confidence: "HIGH",
      target: targetFromCandidate(preferredGsc[0]),
      reason: "Supplied GSC evidence shows CURRENT_CMS ownership of the related query/page.",
      evidence: { ...baseEvidence(), gscOwnership: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // --- 5/6. Explicit cannibalization / duplicate signals + multi-target ---
  if (signalCannibal || deterministicPool.length >= 2) {
    return finish({
      verdict: "CANNIBALIZATION_RISK",
      confidence: "HIGH",
      reason:
        deterministicPool.length >= 2
          ? "Two or more plausible current Blog targets for the same opportunity."
          : "Cannibalization risk signal without a single authoritative target.",
      evidence: { ...baseEvidence(), cannibalizationRisk: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // AI STRONG with a single deterministic target already handled above.
  // AI STRONG + matched URL that resolved → handled. Without target → UNKNOWN later.

  // Clear single target from AI STRONG + matched candidate already covered by URL match.
  // If AI says STRONG and we somehow have exactly one deterministic pool member:
  if (coverage === "STRONG" && deterministicPool.length === 1) {
    return finish({
      verdict: "REFRESH_EXISTING",
      confidence: "MEDIUM",
      target: targetFromCandidate(deterministicPool[0]),
      reason: "AI STRONG coverage supported by a deterministic current Blog target.",
      evidence: baseEvidence(),
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // Duplicate + clear target would have been caught by exact matches.
  // Duplicate without clear target:
  if (signalDuplicate) {
    return finish({
      verdict: "DUPLICATE",
      confidence: "MEDIUM",
      reason: "Duplicate signal without a single authoritative current Blog target.",
      evidence: { ...baseEvidence(), duplicate: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // Draft reservation (supplied keys or corpus draft not already resolved above):
  // clear draft target → REFRESH_EXISTING; weaker identity → DUPLICATE (blocks PASS).
  // Published exact ownership already outranked drafts via preferPublished in step 2.
  if (reservations.draftTarget) {
    return finish({
      verdict: "REFRESH_EXISTING",
      confidence: "MEDIUM",
      target: targetFromCandidate(reservations.draftTarget),
      reason:
        "Draft BlogPost clearly reserves the same slug — refresh the draft, do not PASS new content.",
      evidence: { ...baseEvidence(), draftReservation: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  if (reservations.draftReservation) {
    return finish({
      verdict: "DUPLICATE",
      confidence: "MEDIUM",
      reason:
        "Draft Blog reservation collides with proposed slug/topic without a single clear draft target.",
      evidence: { ...baseEvidence(), draftReservation: true, duplicate: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  if (reservations.planningReservation) {
    return finish({
      verdict: "DUPLICATE",
      confidence: "MEDIUM",
      reason: "Supplied Planning reservation collides with topic/slug — do not PASS new content.",
      evidence: { ...baseEvidence(), planningReservation: true, duplicate: true },
      historicalCandidate: histOut || undefined,
      topic,
      proposedSlug,
    });
  }

  // --- 4. Eligible historical blocks PASS ---
  if (histOut) {
    return finish({
      verdict: "UNKNOWN",
      confidence: "MEDIUM",
      reason: "Eligible historical candidate present — PASS_NEW_CONTENT blocked; disposition deferred to NBA.",
      evidence: { ...baseEvidence(), historicalPath: histOut.path },
      historicalCandidate: histOut,
      topic,
      proposedSlug,
    });
  }

  // AI STRONG without deterministic target → UNKNOWN (do not invent)
  if (coverage === "STRONG") {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "AI STRONG coverage without a deterministic current Blog target.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // PARTIAL alone does not PASS
  if (coverage === "PARTIAL") {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "PARTIAL existing coverage is supporting evidence only — insufficient for PASS or REFRESH.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // Empty / weak topic
  if (!materialTopicExists(input)) {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "No material topic — default UNKNOWN.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // Incomplete corpus → never PASS
  if (!corpusComplete) {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "Corpus projection incomplete/unknown — cannot prove safe absence for PASS_NEW_CONTENT.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // Thin evidence
  if (!materialEvidence) {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "Material research/GSC evidence absent — default UNKNOWN.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // Existing coverage must be effectively absent (NONE or unset with complete corpus)
  if (coverage && coverage !== "NONE") {
    return finish({
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "Existing coverage is not effectively absent.",
      evidence: baseEvidence(),
      topic,
      proposedSlug,
    });
  }

  // --- 9. Hard PASS standard ---
  return finish({
    verdict: "PASS_NEW_CONTENT",
    confidence: materialEvidence && coverage === "NONE" ? "HIGH" : "MEDIUM",
    reason: "No current ownership, historical, duplicate, reservation, or ambiguity — material evidence supports new content.",
    evidence: baseEvidence(),
    topic,
    proposedSlug,
  });
}
