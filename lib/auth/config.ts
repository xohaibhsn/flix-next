const MIN_SESSION_SECRET_LENGTH = 32;

export type AdminAuthConfig = {
  username: string;
  password: string;
  sessionSecret: string;
};

export function getAdminAuthConfig(): AdminAuthConfig | null {
  const username = process.env.ADMIN_USERNAME?.trim() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";

  if (!username || !password || sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    return null;
  }

  return { username, password, sessionSecret };
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
