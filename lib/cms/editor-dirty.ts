/** Stable dirty check for editor form state vs last persisted baseline. */
export function isEditorDirty<T>(current: T, saved: T) {
  return JSON.stringify(current) !== JSON.stringify(saved);
}
