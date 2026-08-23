import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";

function dataDir() {
  return path.join(process.cwd(), "data");
}

export function dataFile(name: string) {
  return path.join(dataDir(), name);
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = dataFile(fileName);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await writeJsonFile(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(fileName: string, data: unknown) {
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const filePath = dataFile(fileName);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmpPath, payload, "utf8");
  try {
    await rename(tmpPath, filePath);
  } catch {
    await writeFile(filePath, payload, "utf8");
    await unlink(tmpPath).catch(() => undefined);
  }
}
