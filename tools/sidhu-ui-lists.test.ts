/* eslint-disable react/no-children-prop -- createElement tests need children in props for TypeScript */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { EmptyState } from "../components/sidhu/ui/EmptyState";
import { StatusBadge } from "../components/sidhu/ui/StatusBadge";
import { StatCard, DashboardSection } from "../components/sidhu/ui/StatCard";
import {
  DataTable,
  DataTableShell,
  TableHead,
  TableSearch,
  TableToolbar,
  Th,
  Td,
} from "../components/sidhu/ui/DataTable";
import { ListActionLink, ListActions } from "../components/sidhu/ui/ListActions";
import { MessagesList } from "../components/sidhu/MessagesList";
import { filterSidhuNavItems } from "../lib/cms/sidhu-nav";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("dashboard renders operational sections from cheap existing data", () => {
  const src = read("app/sidhu/(protected)/page.tsx");
  assert.match(src, /DashboardSection title="Content"/);
  assert.match(src, /DashboardSection title="Operations"/);
  assert.match(src, /DashboardSection title="Site"/);
  assert.match(src, /DashboardSection title="SEO"/);
  assert.match(src, /DashboardSection title="Quick actions"/);
  assert.match(src, /cms\.dashboardStats\(\)/);
  assert.match(src, /cms\.listCategories\(\)/);
  assert.doesNotMatch(src, /runSeoHealth|openai|setInterval|poll/i);
  assert.doesNotMatch(src, /GSC|vanity|analytics score/i);
});

test("permission filtering remains intact for nav modules", () => {
  const custom = filterSidhuNavItems("custom", ["pages", "messages"]);
  assert.deepEqual(
    custom.map((item) => item.href),
    ["/sidhu/pages/", "/sidhu/messages/"],
  );
});

test("pages list keeps edit routes via editorHrefForPageId", () => {
  const src = read("app/sidhu/(protected)/pages/page.tsx");
  assert.match(src, /editorHrefForPageId/);
  assert.match(src, /ListActionLink/);
  assert.match(src, /Edit/);
  assert.match(src, /StatusBadge/);
});

test("blog list keeps posts, categories, listing SEO, and edit/view routes", () => {
  const blogPage = read("app/sidhu/(protected)/blog/page.tsx");
  const blogList = read("components/sidhu/BlogList.tsx");
  assert.match(blogPage, /PageSeoPanel/);
  assert.match(blogPage, /listingSeo=/);
  assert.match(blogPage, /\/sidhu\/blog\/new\//);
  assert.match(blogList, /id: "posts"/);
  assert.match(blogList, /id: "categories"/);
  assert.match(blogList, /id: "listing-seo"/);
  assert.match(blogList, /\/sidhu\/blog\/\$\{post\.id\}\//);
  assert.match(blogList, /blogPostPath/);
  assert.match(blogList, /\/sidhu\/blog\/category\/\$\{category\.id\}\//);
  assert.match(blogList, /deletePostAction/);
  assert.match(blogList, /saveCategoryAction/);
  assert.match(blogList, /StatusBadge/);
});

test("media keeps upload/alt/delete wiring with toolbar empty states", () => {
  const src = read("components/sidhu/MediaLibrary.tsx");
  assert.match(src, /uploadSidhuImage/);
  assert.match(src, /updateSidhuImageAlt/);
  assert.match(src, /deleteSidhuImage/);
  assert.match(src, /TableSearch/);
  assert.match(src, /EmptyState/);
  assert.match(src, /Save alt/);
  assert.match(src, /Select\/Use/);
});

test("redirect manager preserves CRUD controls", () => {
  const src = read("components/sidhu/RedirectManager.tsx");
  assert.match(src, /saveRedirectAction/);
  assert.match(src, /deleteRedirectAction/);
  assert.match(src, /Add redirect/);
  assert.match(src, /Disable/);
  assert.match(src, /Enable/);
  assert.match(src, /Delete/);
  assert.match(src, /EmptyState/);
});

test("FAQ manager preserves save/delete and sort order field", () => {
  const src = read("components/sidhu/FaqManager.tsx");
  assert.match(src, /saveFaqAction/);
  assert.match(src, /deleteFaqAction/);
  assert.match(src, /Add FAQ/);
  assert.match(src, /Sort order/);
  assert.match(src, /sortOrder/);
});

test("pricing manager preserves plan controls", () => {
  const src = read("components/sidhu/PricingManager.tsx");
  assert.match(src, /savePlanAction/);
  assert.match(src, /deletePlanAction/);
  assert.match(src, /Add plan/);
  assert.match(src, /formatGbpPrice/);
});

test("messages list no longer puts full body in the primary table", () => {
  const html = renderToStaticMarkup(
    createElement(MessagesList, {
      messages: [
        {
          id: "msg-1",
          name: "Alex",
          email: "alex@example.com",
          phone: "",
          subject: "Help",
          message: "This is a long contact message body that must not dominate the primary table layout.",
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ],
    }),
  );
  assert.match(html, /Alex/);
  assert.match(html, /Help/);
  assert.match(html, /View/);
  assert.doesNotMatch(html, /long contact message body that must not dominate/);
});

test("users manager keeps role labels and edit paths", () => {
  const src = read("components/sidhu/UsersManager.tsx");
  assert.match(src, /ROLE_LABELS/);
  assert.match(src, /\/sidhu\/users\/\$\{user\.id\}\//);
  assert.match(src, /setUserActiveAction/);
  assert.match(src, /createUserAction/);
  assert.match(src, /StatusBadge/);
  assert.doesNotMatch(src, /label=\{ROLE_LABELS/);
});

test("StatusBadge always renders text with tone classes", () => {
  const html = renderToStaticMarkup(
    createElement(StatusBadge, { tone: "success", children: "Published" }),
  );
  assert.match(html, /Published/);
  assert.match(html, /bg-emerald-50/);
});

test("EmptyState renders title and optional action", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      title: "No redirects",
      description: "Add one to continue.",
      action: createElement("button", { type: "button", children: "Add redirect" }),
    }),
  );
  assert.match(html, /No redirects/);
  assert.match(html, /Add one to continue/);
  assert.match(html, /Add redirect/);
});

test("DataTable foundation exposes labelled search and semantic headers", () => {
  const html = renderToStaticMarkup(
    createElement(DataTableShell, {
      toolbar: createElement(TableToolbar, {
        children: createElement(TableSearch, {
          id: "demo-search",
          label: "Search demo",
          value: "",
          onChange: () => undefined,
        }),
      }),
      children: createElement(DataTable, {
        children: [
          createElement(TableHead, {
            key: "h",
            children: createElement("tr", { children: createElement(Th, { children: "Name" }) }),
          }),
          createElement("tbody", {
            key: "b",
            children: createElement("tr", { children: createElement(Td, { children: "Home" }) }),
          }),
        ],
      }),
    }),
  );
  assert.match(html, /Search demo/);
  assert.match(html, /scope="col"/);
  assert.match(html, /Home/);
});

test("StatCard and list actions keep navigation affordances", () => {
  const card = renderToStaticMarkup(
    createElement(DashboardSection, {
      title: "Content",
      children: createElement(StatCard, { label: "Pages", value: 3, href: "/sidhu/pages/" }),
    }),
  );
  assert.match(card, /Content/);
  assert.match(card, /Pages/);
  assert.match(card, /href="\/sidhu\/pages\/?"/);

  const actions = renderToStaticMarkup(
    createElement(ListActions, {
      children: createElement(ListActionLink, { href: "/sidhu/blog/1/", children: "Edit" }),
    }),
  );
  assert.match(actions, /Edit/);
  assert.match(actions, /\/sidhu\/blog\/1\/?/);
});

test("package.json still has no new UI framework dependencies", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["@mui/material", "antd", "@chakra-ui/react", "shadcn", "framer-motion", "recharts"]) {
    assert.equal(all[name], undefined);
  }
});
