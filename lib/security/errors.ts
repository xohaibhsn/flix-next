export function publicErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV !== "production" && error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
