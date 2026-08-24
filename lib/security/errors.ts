export function publicErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV !== "production" && error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function logServerError(scope: string, error: unknown) {
  const raw = error instanceof Error ? error.message : "unknown error";
  const safe = raw
    .replace(/password=[^;\s&]+/gi, "password=***")
    .replace(/pwd=[^;\s&]+/gi, "pwd=***")
    .replace(/(api[_-]?secret|api[_-]?key|session[_-]?secret)\s*[:=]\s*\S+/gi, "$1=***")
    .split("\n")[0]
    .slice(0, 500);
  console.error(`[${scope}] ${safe}`);
}
