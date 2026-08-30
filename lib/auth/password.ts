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
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, passwordHash);
}

const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

export async function verifyPasswordDummy(password: string) {
  try {
    await verifyPassword(password, DUMMY_HASH);
  } catch {
    /* ignore dummy compare failures */
  }
}
