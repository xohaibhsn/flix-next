export type SqlValue = string | number | null;
export type SqlTable = {
  name: string;
  columns: string[] | null;
  rows: SqlValue[][];
};

const INSERT_START = /INSERT(?:\s+IGNORE)?\s+INTO\s+`([^`]+)`\s*/gi;

export function detectTablePrefix(sql: string) {
  const counts = new Map<string, number>();
  const re = /(?:CREATE TABLE|INSERT(?:\s+IGNORE)?\s+INTO)\s+`((?:[^`]+)posts)`/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const prefix = match[1].slice(0, -"posts".length);
    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  let best = "wp_";
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best;
}

export function parseSqlString(input: string, start: number): { value: string; end: number } {
  let i = start + 1;
  let out = "";
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[i + 1];
      const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0" };
      out += map[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === "'" && input[i + 1] === "'") {
      out += "'";
      i += 2;
      continue;
    }
    if (ch === "'") return { value: out, end: i + 1 };
    out += ch;
    i += 1;
  }
  throw new Error("Unterminated SQL string.");
}

export function parseSqlValueList(input: string): { values: SqlValue[]; end: number } {
  const values: SqlValue[] = [];
  let i = 0;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  if (input[i] !== "(") throw new Error("Expected '(' for SQL value tuple.");
  i += 1;
  while (i < input.length) {
    while (i < input.length && /[\s,]/.test(input[i])) i += 1;
    if (input[i] === ")") return { values, end: i + 1 };
    if (input.slice(i, i + 4).toUpperCase() === "NULL" && /[\s,)]/.test(input[i + 4] || ")")) {
      values.push(null);
      i += 4;
      continue;
    }
    if (input[i] === "'" || input.slice(i, i + 2).toUpperCase() === "N'") {
      if (input[i] === "N" || input[i] === "n") i += 1;
      const parsed = parseSqlString(input, i);
      values.push(parsed.value);
      i = parsed.end;
      continue;
    }
    const slice = input.slice(i);
    const num = slice.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (num) {
      values.push(Number(num[0]));
      i += num[0].length;
      continue;
    }
    throw new Error(`Unexpected SQL value at: ${slice.slice(0, 40)}`);
  }
  throw new Error("Unterminated SQL value tuple.");
}

function parseColumnList(input: string): { columns: string[]; end: number } {
  const columns: string[] = [];
  let i = 0;
  while (i < input.length && /\s/.test(input[i])) i += 1;
  if (input[i] !== "(") return { columns, end: 0 };
  i += 1;
  while (i < input.length) {
    while (i < input.length && /[\s,]/.test(input[i])) i += 1;
    if (input[i] === ")") return { columns, end: i + 1 };
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      columns.push(input.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    const match = input.slice(i).match(/^([A-Za-z0-9_]+)/);
    if (!match) throw new Error("Invalid SQL column list.");
    columns.push(match[1]);
    i += match[1].length;
  }
  throw new Error("Unterminated SQL column list.");
}

export function extractInserts(sql: string, wanted: Set<string>) {
  const tables = new Map<string, SqlTable>();
  let i = 0;
  while (i < sql.length) {
    INSERT_START.lastIndex = i;
    const start = INSERT_START.exec(sql);
    if (!start) break;
    const table = start[1];
    i = start.index + start[0].length;
    if (!wanted.has(table)) {
      const semi = sql.indexOf(";", i);
      i = semi === -1 ? sql.length : semi + 1;
      continue;
    }
    let columns: string[] | null = null;
    while (i < sql.length && /\s/.test(sql[i])) i += 1;
    if (sql[i] === "(") {
      const parsed = parseColumnList(sql.slice(i));
      columns = parsed.columns;
      i += parsed.end;
    }
    while (i < sql.length && /\s/.test(sql[i])) i += 1;
    if (!/^VALUES/i.test(sql.slice(i, i + 6))) {
      const semi = sql.indexOf(";", i);
      i = semi === -1 ? sql.length : semi + 1;
      continue;
    }
    i += 6;
    const rows: SqlValue[][] = [];
    while (i < sql.length) {
      while (i < sql.length && /[\s,]/.test(sql[i])) i += 1;
      if (sql[i] === ";") {
        i += 1;
        break;
      }
      if (sql[i] !== "(") {
        const semi = sql.indexOf(";", i);
        i = semi === -1 ? sql.length : semi + 1;
        break;
      }
      const parsed = parseSqlValueList(sql.slice(i));
      rows.push(parsed.values);
      i += parsed.end;
    }
    const current = tables.get(table) || { name: table, columns, rows: [] };
    if (!current.columns && columns) current.columns = columns;
    current.rows.push(...rows);
    tables.set(table, current);
  }
  return tables;
}

export function rowsToObjects(table: SqlTable, fallbackColumns: string[]) {
  const columns = table.columns?.length ? table.columns : fallbackColumns;
  return table.rows.map((row) => {
    const record: Record<string, SqlValue> = {};
    columns.forEach((column, index) => {
      record[column] = row[index] ?? null;
    });
    return record;
  });
}

export const WP_POST_COLUMNS = [
  "ID",
  "post_author",
  "post_date",
  "post_date_gmt",
  "post_content",
  "post_title",
  "post_excerpt",
  "post_status",
  "comment_status",
  "ping_status",
  "post_password",
  "post_name",
  "to_ping",
  "pinged",
  "post_modified",
  "post_modified_gmt",
  "post_content_filtered",
  "post_parent",
  "guid",
  "menu_order",
  "post_type",
  "post_mime_type",
  "comment_count",
];

export const WP_POSTMETA_COLUMNS = ["meta_id", "post_id", "meta_key", "meta_value"];
export const WP_TERMS_COLUMNS = ["term_id", "name", "slug", "term_group"];
export const WP_TERM_TAXONOMY_COLUMNS = ["term_taxonomy_id", "term_id", "taxonomy", "description", "parent", "count"];
export const WP_TERM_RELATIONSHIPS_COLUMNS = ["object_id", "term_taxonomy_id", "term_order"];
