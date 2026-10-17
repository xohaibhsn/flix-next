import { randomBytes } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import { cmsJsonWritesAllowed } from "@/lib/db/config";
import { ClientError } from "@/lib/security/errors";

function dataDir() {
  return path.join(process.cwd(), "data");
}

export function dataFile(name: string) {
  return path.join(dataDir(), name);
}

/** Authoritative JSON write boundary — production runtime and production build fail closed. */
export function assertCmsJsonWritesAllowed() {
  if (!cmsJsonWritesAllowed()) {
    throw new ClientError("CMS storage is unavailable.");
  }
}

const writeChains = new Map<string, Promise<unknown>>();

/**
 * Same-process serialization for a JSON data file.
 * Not cross-process / multi-worker safe — multiple Node processes can still race.
 */
export async function withJsonFileLock<T>(fileName: string, work: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(fileName) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  writeChains.set(
    fileName,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

async function writeJsonFileUnlocked(fileName: string, data: unknown) {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const filePath = dataFile(fileName);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  try {
    await rename(tmpPath, filePath);
  } catch {
    await writeFile(filePath, payload, "utf8");
    await unlink(tmpPath).catch(() => undefined);
  }
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = dataFile(fileName);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Never create snapshot files when JSON mutations are forbidden.
      if (cmsJsonWritesAllowed()) {
        await writeJsonFile(fileName, fallback);
      }
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(fileName: string, data: unknown) {
  assertCmsJsonWritesAllowed();
  return withJsonFileLock(fileName, () => writeJsonFileUnlocked(fileName, data));
}

/** Caller already holds `withJsonFileLock` for this file. */
export async function writeJsonFileInLock(fileName: string, data: unknown) {
  assertCmsJsonWritesAllowed();
  return writeJsonFileUnlocked(fileName, data);
}
