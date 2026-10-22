import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningList } from "@/components/sidhu/SeoPlanningList";
import { SeoPlanningTestFixtureCreateControl } from "@/components/sidhu/SeoPlanningTestFixtureCreateControl";
import { requireAdminSession } from "@/lib/auth/guards";
import { cms } from "@/lib/cms/repository";
import {
  SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED,
  shouldRenderSeoPlanningTestFixtureCreateControl,
} from "@/lib/cms/seo-planning/test-fixture";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const view = params.view === "archived" ? "archived" : "active";
  const [activeDrafts, archivedDrafts] = await Promise.all([
    cms.listSeoPlanningDrafts({ lifecycle: "active" }),
    cms.listSeoPlanningDrafts({ lifecycle: "archived" }),
  ]);
  const drafts = view === "archived" ? archivedDrafts : activeDrafts;
  // Compile-time OFF hides the control for every role, including Super Admin.
  const showFixtureCreate = shouldRenderSeoPlanningTestFixtureCreateControl({
    creationEnabled: SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED,
    role: session.role,
  });

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Planning" }]}
    >
      <SeoModuleChrome>
        {showFixtureCreate ? <SeoPlanningTestFixtureCreateControl /> : null}
        <SeoPlanningList
          drafts={drafts}
          view={view}
          activeCount={activeDrafts.length}
          archivedCount={archivedDrafts.length}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
