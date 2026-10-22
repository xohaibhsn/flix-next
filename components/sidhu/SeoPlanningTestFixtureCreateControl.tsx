"use client";

import { useState, useTransition } from "react";
import { createSeoPlanningEditorialEvidenceTestFixtureAction } from "@/lib/cms/seo-planning-actions";
import {
  SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM,
  SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
} from "@/lib/cms/seo-planning/test-fixture";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

/**
 * Temporary Super Admin-only control for the reserved Editorial Evidence TEST fixture.
 * Compile-time creation gate remains OFF until a separately approved ON release.
 * Not a standing CMS feature — remove after acceptance cycle.
 */
export function SeoPlanningTestFixtureCreateControl() {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createFixture() {
    if (pending) return;
    if (
      !window.confirm(
        `Create TEST fixture?\n\n${SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE}\n\nDO NOT PUBLISH. Server owns identity. One-shot latch will block recreation after success.`,
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Type exactly to confirm TEST fixture creation:\n\n${SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM}`,
    );
    if (typed == null) return;
    setMessage(null);
    setCreatedId(null);
    startTransition(async () => {
      const result = await createSeoPlanningEditorialEvidenceTestFixtureAction({
        confirmation: typed,
      });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setCreatedId(result.draft.id);
      setMessage({
        tone: "ok",
        text: `TEST fixture created. Planning ID: ${result.draft.id}`,
      });
    });
  }

  return (
    <SectionCard className="space-y-3 border-amber-200 bg-amber-50/40">
      <h3 className="text-sm font-semibold text-ink">
        TEST — SEO Editorial Evidence Acceptance — DO NOT PUBLISH
      </h3>
      <p className="text-sm text-muted">
        Temporary Super Admin create control. Creation stays compile-time OFF until a separately
        approved ON release. No Blog, Research, GSC, or AI side effects.
      </p>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {createdId ? (
        <p className="text-sm font-mono text-ink">
          <a className="underline" href={`/sidhu/seo/planning/${createdId}/`}>
            Open {createdId}
          </a>
        </p>
      ) : null}
      <Button type="button" variant="secondary" disabled={pending} onClick={createFixture}>
        {pending ? "Creating…" : "Create TEST fixture (Super Admin)"}
      </Button>
    </SectionCard>
  );
}
