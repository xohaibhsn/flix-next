import "server-only";

import { readFile } from "fs/promises";
import {
  emptySeoHealthState,
  sanitizeSeoHealthState,
  SEO_HEALTH_STATE_KEY,
  type SeoHealthStateV1,
} from "@/lib/cms/seo-health-memory";
import { dataFile, writeJsonFile } from "@/lib/cms/json-store";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getDbPool } from "@/lib/db/pool";
import type { RowDataPacket } from "mysql2";

const JSON_STATE_FILE = "seo-health-state.json";

type SettingRow = RowDataPacket & { setting_value: string };

function parseStateValue(value: unknown): SeoHealthStateV1 {
  if (value && typeof value === "object") return sanitizeSeoHealthState(value);
  if (typeof value !== "string" || !value) return emptySeoHealthState();
  try {
    return sanitizeSeoHealthState(JSON.parse(value));
  } catch {
    return emptySeoHealthState();
  }
}

async function readMysqlState(): Promise<SeoHealthStateV1> {
  const [rows] = await getDbPool().query<SettingRow[]>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [SEO_HEALTH_STATE_KEY],
  );
  if (!rows[0]) return emptySeoHealthState();
  return parseStateValue(rows[0].setting_value);
}

async function writeMysqlState(state: SeoHealthStateV1) {
  await getDbPool().execute(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SEO_HEALTH_STATE_KEY, JSON.stringify(sanitizeSeoHealthState(state))],
  );
}

/** Pure read — never create/write state on Overview or idle Health loads. */
async function readJsonState(): Promise<SeoHealthStateV1> {
  try {
    const raw = await readFile(dataFile(JSON_STATE_FILE), "utf8");
    return sanitizeSeoHealthState(JSON.parse(raw) as unknown);
  } catch {
    return emptySeoHealthState();
  }
}

async function writeJsonState(state: SeoHealthStateV1) {
  await writeJsonFile(JSON_STATE_FILE, sanitizeSeoHealthState(state));
}

export async function getSeoHealthState(): Promise<SeoHealthStateV1> {
  try {
    return isDatabaseConfigured() ? await readMysqlState() : await readJsonState();
  } catch {
    return emptySeoHealthState();
  }
}

export async function saveSeoHealthState(state: SeoHealthStateV1): Promise<void> {
  const next = sanitizeSeoHealthState(state);
  if (isDatabaseConfigured()) {
    await writeMysqlState(next);
    return;
  }
  await writeJsonState(next);
}
