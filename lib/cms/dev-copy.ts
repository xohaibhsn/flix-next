const LEAKED_SNIPPETS = [
  "cursor",
  "perfect bhai",
  "latest phase",
  "tiptap selection bug",
  "live verification",
  "/sidhu/blog/new/",
  "technical pending list",
  "old wordpress blog dry-run",
  "junaid final review",
  "admin password change",
  "ab mujhe live test results",
];

const EXACT_TEST_TITLES = ["test", "tesr", "dummy", "placeholder", "lorem ipsum"];

export function normalizeCopyText(value: string) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function containsLeakedDevCopy(value: string) {
  const text = normalizeCopyText(value);
  if (!text) return false;
  if (LEAKED_SNIPPETS.some((snippet) => text.includes(snippet))) return true;
  if (/\blorem ipsum\b/.test(text)) return true;
  return false;
}

export function isExactTestTitle(value: string) {
  return EXACT_TEST_TITLES.includes(String(value || "").trim().toLowerCase());
}

export function assertProfessionalSeedCopy(value: string, label: string) {
  if (containsLeakedDevCopy(value) || isExactTestTitle(value)) {
    throw new Error(`${label} contains development/test copy and cannot be used as production seed content.`);
  }
}
