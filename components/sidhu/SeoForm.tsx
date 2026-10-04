"use client";

import { useRef, useState } from "react";
import { saveSeoSettingsAction } from "@/lib/cms/actions";
import type { SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextArea } from "@/components/sidhu/fields";
import { parseJsonLdInput } from "@/lib/cms/json-ld-input";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { Button } from "@/components/sidhu/ui/Button";

const JSON_LD_HINT =
  "Paste JSON-LD or a <script type=\"application/ld+json\"> wrapper. Invalid JSON is rejected and the last valid value is kept. Leave empty to render nothing.";

/** Site-wide custom JSON-LD editor — save contract unchanged (saveSeoSettingsAction). */
export function SeoForm({ settings: initial }: { settings: SiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const savingLock = useRef(false);

  function validate() {
    const parsed = parseJsonLdInput(settings.siteCustomJsonLd || "");
    if (!parsed.ok) {
      setFeedback({ tone: "error", text: parsed.error });
      return;
    }
    if (!parsed.data) {
      setFeedback({ tone: "info", text: "Empty — nothing will be rendered." });
      return;
    }
    setFeedback({ tone: "ok", text: "Valid JSON-LD." });
  }

  async function save() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try {
      const result = await saveSeoSettingsAction(settings);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setSettings(result.settings);
      setMessage({ tone: "ok", text: "Site-wide schema saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not save SEO settings.",
      });
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <SectionCard className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Site-wide Custom JSON-LD Schema</h2>
          <p className="mt-1 text-sm text-muted">
            Organization schema is automatically rendered on Home only. Use this field only for additional schema you
            intentionally want across the site.
          </p>
        </div>
        <Field label="Site-wide Custom JSON-LD Schema" hint={JSON_LD_HINT}>
          <TextArea
            value={settings.siteCustomJsonLd || ""}
            onChange={(event) => setSettings({ ...settings, siteCustomJsonLd: event.target.value })}
            spellCheck={false}
            className="min-h-40 font-mono text-xs leading-relaxed"
            placeholder='{ "@context": "https://schema.org", "@type": "Service" }'
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={validate}>
              Validate
            </Button>
            {feedback ? (
              <span className={feedback.tone === "error" ? "text-xs text-red-700" : "text-xs text-muted"}>
                {feedback.text}
              </span>
            ) : null}
          </div>
        </Field>
        <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save site-wide schema"}
        </Button>
      </SectionCard>
    </div>
  );
}
