const MIN_SESSION_SECRET_LENGTH = 32;

export type AdminAuthConfig = {
  username: string;
  password: string;
  sessionSecret: string;
};

export function getSessionSecret() {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) return null;
  return sessionSecret;
}

export function getBootstrapCredentials() {
  const username = (process.env.ADMIN_USERNAME?.trim() || "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!username || !password) return null;
  return { username, password };
}

export function getPrimaryAdminUsername() {
  return (process.env.ADMIN_USERNAME?.trim() || "admin").toLowerCase();
}

export function getAdminAuthConfig(): AdminAuthConfig | null {
  const sessionSecret = getSessionSecret();
  const bootstrap = getBootstrapCredentials();
  if (!sessionSecret || !bootstrap) return null;
  return { username: bootstrap.username, password: bootstrap.password, sessionSecret };
}

export function isEmergencyRecoveryEnabled() {
  const raw = process.env.ADMIN_EMERGENCY_RECOVERY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isEmergencyPasswordResetEnabled() {
  const raw = process.env.ADMIN_EMERGENCY_RESET_PASSWORD?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
