/** Shared Visual / HTML mode helpers for Sidhu RichTextEditor (no TipTap DOM required). */

export type RichTextEditorMode = "visual" | "html";

export const DEFAULT_RICH_TEXT_EDITOR_MODE: RichTextEditorMode = "visual";

export function normalizeEditorHtml(html: string | null | undefined): string {
  const value = String(html ?? "");
  return value.trim() ? value : "<p></p>";
}

/**
 * Visual → HTML: capture the live TipTap HTML, push it through onChange, return it for the textarea.
 * Does not entity-escape markup.
 */
export function enterHtmlSourceMode(options: {
  getEditorHtml: () => string;
  onChange: (html: string) => void;
}): string {
  const html = options.getEditorHtml();
  options.onChange(html);
  return html;
}

/**
 * HTML → Visual: load the latest source string into TipTap without emitUpdate feedback loops,
 * then sync parent state to the same string.
 */
export function enterVisualModeFromSource(options: {
  sourceHtml: string;
  setContent: (html: string, opts: { emitUpdate: boolean }) => void;
  onChange: (html: string) => void;
}): string {
  const html = normalizeEditorHtml(options.sourceHtml);
  options.setContent(html, { emitUpdate: false });
  options.onChange(html);
  return html;
}

/**
 * While HTML mode is active, decide whether an incoming parent `value` should replace the textarea.
 * Echoes of our own onChange are ignored; genuine external updates (media insert, reload) apply.
 */
export function resolveHtmlModeIncomingValue(options: {
  incoming: string;
  lastEmitted: string;
}): { apply: boolean; next: string } {
  const incoming = String(options.incoming ?? "");
  if (incoming === options.lastEmitted) {
    return { apply: false, next: options.lastEmitted };
  }
  return { apply: true, next: incoming };
}

/** Round-trip identity check helper for tests (no escaping). */
export function sourceRoundTrip(html: string): string {
  return enterHtmlSourceMode({
    getEditorHtml: () => html,
    onChange: () => undefined,
  });
}
