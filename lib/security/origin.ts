function requestHost(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || "").split(",")[0]?.trim().toLowerCase();
  return host;
}

function urlHost(value: string) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

export function isSameOriginMutation(request: Request) {
  const host = requestHost(request);
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) return urlHost(origin) === host;

  const referer = request.headers.get("referer");
  if (referer) return urlHost(referer) === host;

  return false;
}
