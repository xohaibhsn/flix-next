import { withSlash } from "@/lib/cms/redirects";

export type SeedPageIdentity = {
  id: string;
  slug: string;
};

export type DefaultPageSeedAction =
  | { type: "insert" }
  | { type: "use-existing"; existingId: string };

export function resolveDefaultPageSeed(
  page: SeedPageIdentity,
  existing: SeedPageIdentity[],
): DefaultPageSeedAction {
  const byId = existing.find((item) => item.id === page.id);
  if (byId) return { type: "use-existing", existingId: byId.id };

  const wanted = withSlash(page.slug);
  const bySlug = existing.find((item) => withSlash(item.slug) === wanted);
  if (bySlug) return { type: "use-existing", existingId: bySlug.id };

  return { type: "insert" };
}

export type SeedPageRecord = SeedPageIdentity & {
  name?: string;
  sections?: unknown[];
};

export function applyDefaultPageSeeds(defaults: SeedPageRecord[], existing: SeedPageRecord[]): SeedPageRecord[] {
  const next = existing.map((page) => ({
    ...page,
    sections: Array.isArray(page.sections) ? [...page.sections] : page.sections,
  }));

  for (const page of defaults.filter((item) => withSlash(item.slug) !== "/")) {
    const action = resolveDefaultPageSeed(page, next);
    if (action.type === "use-existing") continue;
    if (next.some((item) => item.id === page.id)) {
      throw new Error(`Duplicate entry '${page.id}' for key 'PRIMARY'`);
    }
    next.push({
      id: page.id,
      slug: page.slug,
      name: page.name,
      sections: Array.isArray(page.sections) ? [...page.sections] : page.sections,
    });
  }

  return next;
}
