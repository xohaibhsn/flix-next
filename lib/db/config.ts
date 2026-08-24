export type DbConfig = {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
};

export function getDbConfig(): DbConfig | null {
  const host = process.env.DB_HOST?.trim() ?? "";
  const name = process.env.DB_NAME?.trim() ?? "";
  const user = process.env.DB_USER?.trim() ?? "";
  const password = process.env.DB_PASSWORD ?? "";
  const portRaw = process.env.DB_PORT?.trim() || "3306";
  const port = Number(portRaw);

  if (!host || !name || !user || !password) {
    return null;
  }
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT must be a valid positive integer.");
  }

  return { host, port, name, user, password };
}

export function isDatabaseConfigured() {
  try {
    return getDbConfig() !== null;
  } catch {
    return false;
  }
}

export function isProductionBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build";
}
