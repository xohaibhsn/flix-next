import bcrypt from "bcryptjs";

const MIN_LENGTH = 12;
const WEAK_PASSWORDS = new Set([
  "admin123",
  "password",
  "password123",
  "123456",
  "12345678",
  "admin",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome",
  "welcome123",
]);

type BcryptApi = {
  hash(data: string, saltOrRounds: string | number): Promise<string>;
  compare(data: string, encrypted: string): Promise<boolean>;
};

function bcryptApi(): BcryptApi {
  const mod = bcrypt as BcryptApi & { default?: BcryptApi };
  const api = typeof mod.hash === "function" ? mod : mod.default;
  if (!api?.hash || !api?.compare) {
    throw new Error("Password hasher is unavailable.");
  }
  return api;
}

export function passwordPolicyError(password: string) {
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol.";
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return "Choose a stronger password.";
  return null;
}

export async function hashPassword(password: string) {
  return bcryptApi().hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash || !passwordHash.startsWith("$2")) return false;
  return bcryptApi().compare(password, passwordHash);
}

const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

export async function verifyPasswordDummy(password: string) {
  try {
    await verifyPassword(password, DUMMY_HASH);
  } catch {
    /* ignore dummy compare failures */
  }
}
