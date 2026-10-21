"use client";

import { useMemo, useState, useTransition } from "react";
import {
  saveSeoPlanningEditorialEvidenceAction,
  type SaveSeoPlanningEditorialEvidenceResult,
} from "@/lib/cms/seo-planning-actions";
import {
  fingerprintEditorialEvidence,
  hasSeoPlanningEditorialEvidenceContent,
  parseSeoPlanningEditorialEvidence,
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS,
  SEO_PLANNING_EDITORIAL_EVIDENCE_TYPES,
  SEO_PLANNING_EDITORIAL_TRUST,
  type SeoPlanningEditorialEvidenceEntry,
  type SeoPlanningEditorialEvidenceType,
  type SeoPlanningEditorialEvidenceV1,
} from "@/lib/cms/seo-planning/editorial-evidence";
import { isSeoPlanningActionableRecommendation } from "@/lib/cms/seo-planning/constants";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput, inputClass } from "@/components/sidhu/fields";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { Button } from "@/components/sidhu/ui/Button";

type EvidenceFormState = {
  originalContribution: string;
  readerBenefit: string;
  missingEvidenceNotes: string;
  entries: Array<{
    id: string;
    evidenceType: SeoPlanningEditorialEvidenceType;
    claim: string;
    url: string;
    location: string;
    notes: string;
  }>;
};

function emptyEntry(index: number): EvidenceFormState["entries"][number] {
  return {
    id: `ee_${index + 1}`,
    evidenceType: "EXTERNAL_REFERENCE",
    claim: "",
    url: "",
    location: "",
    notes: "",
  };
}

function formFromEvidence(evidence: SeoPlanningEditorialEvidenceV1): EvidenceFormState {
  return {
    originalContribution: evidence.originalContribution,
    readerBenefit: evidence.readerBenefit,
    missingEvidenceNotes: evidence.missingEvidenceNotes,
    entries: evidence.entries.map((entry, index) => ({
      id: entry.id || `ee_${index + 1}`,
      evidenceType: entry.evidenceType,
      claim: entry.claim,
      url: entry.url,
      location: entry.location,
      notes: entry.notes,
    })),
  };
}

function formToRawEvidence(form: EvidenceFormState) {
  return {
    version: "v1",
    originalContribution: form.originalContribution,
    readerBenefit: form.readerBenefit,
    missingEvidenceNotes: form.missingEvidenceNotes,
    entries: form.entries.map((entry) => ({
      ...entry,
      // Client may send trust; server always overwrites to EDITORIAL_UNVERIFIED.
      trust: SEO_PLANNING_EDITORIAL_TRUST,
    })),
  };
}

function typeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function SeoPlanningEditorialEvidencePanel({
  draft,
  archived,
  blocked = false,
  onBusy,
  onDraft,
  onMessage,
}: {
  draft: SeoPlanningDraft;
  archived: boolean;
  /** True when sibling Planning mutations are in flight. */
  blocked?: boolean;
  onBusy?: (busy: boolean) => void;
  onDraft: (draft: SeoPlanningDraft) => void;
  onMessage: (message: { tone: "ok" | "error"; text: string } | null) => void;
}) {
  const initialEvidence = readSeoPlanningEditorialEvidence(draft.payload);
  const [form, setForm] = useState<EvidenceFormState>(() => formFromEvidence(initialEvidence));
  const [savedForm, setSavedForm] = useState<EvidenceFormState>(() =>
    formFromEvidence(initialEvidence),
  );
  const [evidenceRevision, setEvidenceRevision] = useState(() =>
    fingerprintEditorialEvidence(initialEvidence),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editable =
    !archived && isSeoPlanningActionableRecommendation(draft.recommendation);
  const controlsLocked = pending || blocked || !editable;
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );

  function syncFromDraft(next: SeoPlanningDraft) {
    const evidence = readSeoPlanningEditorialEvidence(next.payload);
    const nextForm = formFromEvidence(evidence);
    setForm(nextForm);
    setSavedForm(nextForm);
    setEvidenceRevision(fingerprintEditorialEvidence(evidence));
    setLocalError(null);
  }

  function updateEntry(
    index: number,
    patch: Partial<EvidenceFormState["entries"][number]>,
  ) {
    setForm((prev) => {
      const entries = prev.entries.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      );
      return { ...prev, entries };
    });
  }

  function addEntry() {
    if (form.entries.length >= SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount) return;
    setForm((prev) => ({
      ...prev,
      entries: [...prev.entries, emptyEntry(prev.entries.length)],
    }));
  }

  function removeEntry(index: number) {
    setForm((prev) => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== index),
    }));
  }

  function revert() {
    setForm(savedForm);
    setLocalError(null);
    onMessage(null);
  }

  function save(clear: boolean) {
    if (pending || blocked || !editable) return;
    setLocalError(null);
    onMessage(null);

    let evidencePayload: SeoPlanningEditorialEvidenceV1 | null = null;
    if (!clear) {
      const parsed = parseSeoPlanningEditorialEvidence(formToRawEvidence(form));
      if (!parsed.ok) {
        setLocalError(parsed.error);
        return;
      }
      evidencePayload = parsed.value;
    }

    onBusy?.(true);
    startTransition(async () => {
      try {
        const result: SaveSeoPlanningEditorialEvidenceResult =
          await saveSeoPlanningEditorialEvidenceAction({
            id: draft.id,
            expectedEvidenceRevision: evidenceRevision,
            clear,
            ...(clear ? {} : { evidence: evidencePayload }),
          });
        if (!result.ok) {
          setLocalError(result.error);
          onMessage({ tone: "error", text: result.error });
          return;
        }
        onDraft(result.draft);
        syncFromDraft(result.draft);
        setEvidenceRevision(result.evidenceRevision);
        onMessage({
          tone: "ok",
          text: clear
            ? "Editorial evidence cleared. Still unverified — nothing was published."
            : "Editorial evidence saved. Trust remains EDITORIAL_UNVERIFIED — nothing was published.",
        });
      } finally {
        onBusy?.(false);
      }
    });
  }

  const savedParsed = parseSeoPlanningEditorialEvidence(formToRawEvidence(savedForm));
  const savedHasContent = savedParsed.ok
    ? hasSeoPlanningEditorialEvidenceContent(savedParsed.value)
    : hasSeoPlanningEditorialEvidenceContent(initialEvidence);

  return (
    <SectionCard className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">Editorial Evidence Capture</h3>
        <p className="text-xs text-muted">
          Private planning notes for Junaid. Saved evidence is always{" "}
          <span className="font-semibold text-ink">{SEO_PLANNING_EDITORIAL_TRUST}</span>
          {" — "}
          URLs are not verified just because they were saved. No auto-save.
        </p>
      </div>

      {!editable ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {archived
            ? "Archived — restore before editing editorial evidence."
            : "This planning recommendation cannot accept editorial evidence edits."}
        </p>
      ) : null}

      {localError ? <Banner tone="error">{localError}</Banner> : null}

      {dirty ? (
        <p className="text-xs font-medium text-amber-900">Unsaved editorial evidence changes.</p>
      ) : null}

      <Field
        label="Original contribution"
        hint={`Max ${SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.originalContribution} characters.`}
      >
        <TextArea
          value={form.originalContribution}
          onChange={(event) =>
            setForm({ ...form, originalContribution: event.target.value })
          }
          maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.originalContribution}
          rows={4}
          disabled={controlsLocked}
        />
      </Field>

      <Field
        label="Reader benefit"
        hint={`Max ${SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.readerBenefit} characters.`}
      >
        <TextArea
          value={form.readerBenefit}
          onChange={(event) => setForm({ ...form, readerBenefit: event.target.value })}
          maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.readerBenefit}
          rows={3}
          disabled={controlsLocked}
        />
      </Field>

      <Field
        label="Missing evidence notes"
        hint={`Max ${SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.missingEvidenceNotes} characters.`}
      >
        <TextArea
          value={form.missingEvidenceNotes}
          onChange={(event) =>
            setForm({ ...form, missingEvidenceNotes: event.target.value })
          }
          maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.missingEvidenceNotes}
          rows={3}
          disabled={controlsLocked}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Evidence entries ({form.entries.length}/
            {SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount})
          </p>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            disabled={
              controlsLocked ||
              form.entries.length >= SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount
            }
            onClick={addEntry}
          >
            Add evidence entry
          </Button>
        </div>

        {form.entries.length === 0 ? (
          <p className="text-sm text-muted">No evidence entries yet.</p>
        ) : (
          form.entries.map((entry, index) => (
            <div
              key={`${entry.id}-${index}`}
              className="space-y-3 rounded-md border border-line px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-ink uppercase">
                  Entry {index + 1} · {SEO_PLANNING_EDITORIAL_TRUST}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-10"
                  disabled={controlsLocked}
                  onClick={() => removeEntry(index)}
                >
                  Remove
                </Button>
              </div>
              <Field label="Evidence type">
                <select
                  className={inputClass}
                  value={entry.evidenceType}
                  disabled={controlsLocked}
                  onChange={(event) =>
                    updateEntry(index, {
                      evidenceType: event.target.value as SeoPlanningEditorialEvidenceType,
                    })
                  }
                >
                  {SEO_PLANNING_EDITORIAL_EVIDENCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Claim">
                <TextInput
                  value={entry.claim}
                  onChange={(event) => updateEntry(index, { claim: event.target.value })}
                  maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.claim}
                  disabled={controlsLocked}
                />
              </Field>
              <Field
                label="Supporting URL"
                hint="HTTP(S) only. Required for external references. Never treated as verified."
              >
                <TextInput
                  value={entry.url}
                  onChange={(event) => updateEntry(index, { url: event.target.value })}
                  maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.url}
                  disabled={controlsLocked}
                  inputMode="url"
                  autoComplete="off"
                />
              </Field>
              <Field label="Evidence location">
                <TextInput
                  value={entry.location}
                  onChange={(event) => updateEntry(index, { location: event.target.value })}
                  maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.location}
                  disabled={controlsLocked}
                />
              </Field>
              <Field label="Editorial notes">
                <TextArea
                  value={entry.notes}
                  onChange={(event) => updateEntry(index, { notes: event.target.value })}
                  maxLength={SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.notes}
                  rows={2}
                  disabled={controlsLocked}
                />
              </Field>
            </div>
          ))
        )}
      </div>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-10"
            disabled={controlsLocked || (!dirty && !savedHasContent)}
            onClick={() => save(false)}
          >
            {pending ? "Saving…" : "Save editorial evidence"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            disabled={controlsLocked || !dirty}
            onClick={revert}
          >
            Cancel / Revert
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            disabled={controlsLocked || (!dirty && !savedHasContent)}
            onClick={() => save(true)}
          >
            Clear evidence
          </Button>
        </div>
      ) : null}

      {/* Read-only echo of saved trust labels for reload visibility */}
      {!dirty && savedForm.entries.length > 0 ? (
        <div className="space-y-1 text-xs text-muted">
          <p className="font-semibold tracking-wide uppercase text-ink">Saved entry trust</p>
          <ul className="space-y-0.5">
            {savedForm.entries.map((entry, index) => (
              <li key={`saved-trust-${entry.id}-${index}`}>
                Entry {index + 1}: {SEO_PLANNING_EDITORIAL_TRUST}
                {entry.url ? (
                  <span className="ml-1 break-all">· URL recorded (unverified)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Test helper — re-export entry shape for readiness/tests without leaking trust spoof. */
export type { SeoPlanningEditorialEvidenceEntry };
