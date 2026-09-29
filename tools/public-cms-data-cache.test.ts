import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withSlash } from "../lib/cms/redirects";
import {
  PUBLIC_CACHE_TAGS,
  PUBLIC_CMS_DATA_REVALIDATE_SECONDS,
} from "../lib/cms/public-cache-tags";

const root = join(process.cwd());
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("public CMS cache tags are stable project-prefixed strings", () => {
  assert.equal(PUBLIC_CACHE_TAGS.settings, "flix:settings");
  assert.equal(PUBLIC_CACHE_TAGS.pages, "flix:pages");
  assert.equal(PUBLIC_CACHE_TAGS.plans, "flix:plans");
  assert.equal(PUBLIC_CACHE_TAGS.faqs, "flix:faqs");
  assert.equal(PUBLIC_CMS_DATA_REVALIDATE_SECONDS, 60);
});

test("public settings loader uses unstable_cache with settings tag and TTL", () => {
  const src = read("lib/cms/public-request-cache.ts");
  assert.match(src, /unstable_cache/);
  assert.match(src, /cms\.getSettings\(\)/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.settings/);
  assert.match(src, /PUBLIC_CMS_DATA_REVALIDATE_SECONDS/);
  assert.match(src, /getPublicSettings\s*=\s*cache\(/);
});

test("page-by-slug cache key varies by slug argument", () => {
  const src = read("lib/cms/public-request-cache.ts");
  assert.match(src, /async \(slug: string\) => cms\.getPageBySlug\(slug\)/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.pages/);
  assert.match(src, /loadPageAcrossRequests\(slug\)/);
  assert.match(src, /withSlash\(slug\)/);
  assert.notEqual(withSlash("/welcome"), withSlash("/contact/"));
  assert.equal(withSlash("/welcome"), withSlash("/welcome/"));
});

test("plans and FAQs loaders use unstable_cache with dedicated tags", () => {
  const src = read("lib/cms/public-request-cache.ts");
  assert.match(src, /getPublicPlans\s*=\s*cache\(/);
  assert.match(src, /getPublicFaqs\s*=\s*cache\(/);
  assert.match(src, /cms\.listPlans\(\)/);
  assert.match(src, /cms\.listFaqs\(\)/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.plans/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.faqs/);
});

test("posts and categories stay request-cache only in Phase C1", () => {
  const src = read("lib/cms/public-request-cache.ts");
  assert.match(src, /getPublicPostBySlug\s*=\s*cache\(async \(slug: string\) => cms\.getPostBySlug\(slug\)\)/);
  assert.match(src, /getPublicCategories\s*=\s*cache\(async \(\) => cms\.listCategories\(\)\)/);
  assert.doesNotMatch(src, /listPosts/);
  assert.doesNotMatch(src, /getMediaById/);
  assert.doesNotMatch(src, /getRedirect|findRedirect|listRedirects/);
});

test("CmsPageView uses cached public plans and FAQs", () => {
  const src = read("components/cms/CmsPageView.tsx");
  assert.match(src, /getPublicPlans/);
  assert.match(src, /getPublicFaqs/);
  assert.match(src, /getPublicPageBySlug/);
  assert.match(src, /getPublicSettings/);
  assert.doesNotMatch(src, /cms\.listPlans\(/);
  assert.doesNotMatch(src, /cms\.listFaqs\(/);
  assert.match(src, /plans\.filter\(\(plan\) => plan\.active\)/);
  assert.match(src, /faqs\.filter\(\(item\) => item\.visible\)/);
});

test("tag invalidation helpers use revalidateTag with expire 0", () => {
  const src = read("lib/cms/revalidate.ts");
  assert.match(src, /revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/);
  assert.match(src, /export function revalidatePublicSettingsData/);
  assert.match(src, /export function revalidatePublicPagesData/);
  assert.match(src, /export function revalidatePublicPlansData/);
  assert.match(src, /export function revalidatePublicFaqsData/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.settings/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.pages/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.plans/);
  assert.match(src, /PUBLIC_CACHE_TAGS\.faqs/);
  assert.doesNotMatch(src, /revalidateTag\([^,\n]+\)\s*;/);
});

test("settings path helpers invalidate settings data tag", () => {
  const src = read("lib/cms/revalidate.ts");
  assert.match(src, /export function revalidateAfterSettingsSave\(\) \{\s*revalidatePublicSettingsData\(\);/);
  assert.match(src, /export function revalidatePageSeo\([^)]+\) \{\s*revalidatePublicSettingsData\(\);/);
});

test("media/sidhu path revalidation does not expire all CMS data tags", () => {
  const src = read("lib/cms/revalidate.ts");
  const sidhuBlock = src.slice(src.indexOf("export function revalidateSidhuCms"), src.indexOf("export function revalidateBlog"));
  assert.doesNotMatch(sidhuBlock, /revalidatePublicSettingsData|revalidatePublicPagesData|revalidatePublicPlansData|revalidatePublicFaqsData|revalidateTag/);
  const publicSiteBlock = src.slice(src.indexOf("export function revalidatePublicSite"), src.indexOf("export function revalidateAfterSettingsSave"));
  assert.doesNotMatch(publicSiteBlock, /revalidatePublicSettingsData|revalidateTag/);
});

test("page save invalidates pages tag and keeps path revalidation", () => {
  const src = read("lib/cms/actions.ts");
  const block = src.slice(src.indexOf("export async function savePageAction"), src.indexOf("export async function saveSettingsAction"));
  assert.match(block, /revalidatePublicPagesData\(\)/);
  assert.match(block, /revalidateSidhuCms\(\)/);
  assert.match(block, /revalidatePublicSlug/);
});

test("settings and SEO saves invalidate settings tag via path helpers", () => {
  const src = read("lib/cms/actions.ts");
  const settings = src.slice(src.indexOf("export async function saveSettingsAction"), src.indexOf("export async function saveSeoSettingsAction"));
  const seo = src.slice(src.indexOf("export async function saveSeoSettingsAction"), src.indexOf("export async function savePageSeoAction"));
  const pageSeo = src.slice(src.indexOf("export async function savePageSeoAction"), src.indexOf("export async function savePlanAction"));
  assert.match(settings, /revalidateAfterSettingsSave\(\)/);
  assert.match(seo, /revalidateAfterSettingsSave\(\)/);
  assert.match(pageSeo, /revalidatePageSeo\(key\)/);
});

test("plan and FAQ save/delete invalidate their data tags", () => {
  const src = read("lib/cms/actions.ts");
  const planSave = src.slice(src.indexOf("export async function savePlanAction"), src.indexOf("export async function deletePlanAction"));
  const planDelete = src.slice(src.indexOf("export async function deletePlanAction"), src.indexOf("export async function saveFaqAction"));
  const faqSave = src.slice(src.indexOf("export async function saveFaqAction"), src.indexOf("export async function deleteFaqAction"));
  const faqDelete = src.slice(src.indexOf("export async function deleteFaqAction"), src.indexOf("export async function savePostAction"));
  assert.match(planSave, /revalidatePublicPlansData\(\)/);
  assert.match(planSave, /revalidateSidhuCms\(\)/);
  assert.match(planDelete, /revalidatePublicPlansData\(\)/);
  assert.match(planDelete, /revalidateSidhuCms\(\)/);
  assert.match(faqSave, /revalidatePublicFaqsData\(\)/);
  assert.match(faqSave, /revalidateSidhuCms\(\)/);
  assert.match(faqDelete, /revalidatePublicFaqsData\(\)/);
  assert.match(faqDelete, /revalidateSidhuCms\(\)/);
});

test("next.config does not enable cacheComponents in Phase C1", () => {
  const src = read("next.config.ts");
  assert.doesNotMatch(src, /cacheComponents\s*:\s*true/);
});

test("CmsPageView remains request-time dynamic", () => {
  const src = read("components/cms/CmsPageView.tsx");
  assert.match(src, /await connection\(\)/);
});
