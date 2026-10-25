import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { applyWordpressPlan, readWordpressDump } from "@/lib/cms/wordpress/apply";
import { WORDPRESS_SELF_TEST_SQL, buildWordpressPlan } from "@/lib/cms/wordpress/extract";
import {
  assertMutationAllowed,
  isCmsWriteFreezeError,
} from "@/lib/cms/write-fence";

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function arg(name: string) {
  const prefix = `--${name}`;
  const index = process.argv.indexOf(prefix);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return "";
  return value;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function help() {
  console.log(`WordPress → Flix IPTV CMS importer

Usage:
  npx tsx tools/import-wordpress.ts --sql tmp/wordpress/backup.sql
  npx tsx tools/import-wordpress.ts --sql tmp/wordpress/backup.sql --report tmp/wordpress/report.json
  npx tsx tools/import-wordpress.ts --self-test
  npx tsx tools/import-wordpress.ts --sql tmp/wordpress/backup.sql --apply --i-understand-writes --media-root tmp/wordpress/public_html

Dry-run is the default. --apply writes to MySQL and also requires --i-understand-writes.
An active CMS_WRITE_FREEZE always blocks apply (acknowledgement cannot override freeze).
Pages are never auto-merged into the page builder. Blog posts can be imported with --apply.
Place dumps in tmp/wordpress/ (gitignored). Do not commit .sql backups.
`);
}

async function main() {
  if (hasFlag("help") || hasFlag("h")) {
    help();
    return;
  }
  if (hasFlag("self-test")) {
    const plan = buildWordpressPlan(WORDPRESS_SELF_TEST_SQL);
    if (plan.prefix !== "wp_" || plan.postsFound !== 1 || plan.pages.length !== 1) {
      throw new Error("Self-test failed: unexpected parse counts.");
    }
    if (!plan.posts[0]?.seoTitle || plan.posts[0].seoTitle !== "Hello SEO") {
      throw new Error("Self-test failed: Yoast title was not mapped.");
    }
    console.log("Self-test passed.");
    console.log(JSON.stringify(summarize(plan), null, 2));
    return;
  }

  const sqlPath = arg("sql");
  if (!sqlPath) {
    help();
    console.error("No WordPress SQL dump was provided. Put the .sql (or .sql.gz) file in tmp/wordpress/ and pass --sql.");
    process.exitCode = 1;
    return;
  }

  loadEnvFiles();
  const dump = await readWordpressDump(resolve(sqlPath));
  const plan = buildWordpressPlan(dump);
  const reportPath = arg("report");
  const summary = summarize(plan);
  console.log(JSON.stringify(summary, null, 2));
  if (reportPath) {
    await writeFile(resolve(reportPath), JSON.stringify({ summary, plan }, null, 2), "utf8");
    console.log(`Wrote report to ${reportPath}`);
  }

  if (!hasFlag("apply")) {
    console.log("Dry-run only. No database writes. Re-run with --apply --i-understand-writes to import blog posts.");
    return;
  }

  if (!hasFlag("i-understand-writes")) {
    console.error(
      "Refusing MySQL writes: pass --i-understand-writes together with --apply after reviewing the dry-run report.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    // Fail closed before opening a DB connection when freeze/generation denies writes.
    assertMutationAllowed("CLI_MAINTENANCE");
  } catch (error) {
    if (isCmsWriteFreezeError(error)) {
      console.error(`Refusing MySQL writes: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const result = await applyWordpressPlan(plan, {
    overwrite: hasFlag("overwrite"),
    mediaRoot: arg("media-root"),
  });
  console.log(JSON.stringify(result, null, 2));
}

function summarize(plan: ReturnType<typeof buildWordpressPlan>) {
  return {
    prefix: plan.prefix,
    postsFound: plan.postsFound,
    published: plan.published,
    drafts: plan.drafts,
    categories: plan.categories.map((item) => item.slug),
    mediaReferences: plan.mediaReferences,
    yoastValuesFound: plan.yoastValuesFound,
    pagePackages: plan.pages.map((page) => ({
      slug: page.slug,
      suggestedRoute: page.suggestedRoute,
      warnings: page.warnings,
    })),
    conflicts: plan.conflicts,
    skipped: plan.skipped,
    warningCount: plan.posts.reduce((sum, post) => sum + post.warnings.length, 0),
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "WordPress import failed.");
  process.exitCode = 1;
});
