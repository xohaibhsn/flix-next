import { AdminShell } from "@/components/sidhu/AdminShell";
import {
  DataTable,
  DataTableShell,
  ListCard,
  ListStack,
  TableHead,
  TableRow,
  TableScroll,
  Td,
  Th,
} from "@/components/sidhu/ui/DataTable";
import { EmptyState } from "@/components/sidhu/ui/EmptyState";
import { ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { StatusBadge } from "@/components/sidhu/ui/StatusBadge";
import { editorHrefForPageId } from "@/lib/cms/page-paths";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuPagesPage() {
  const pages = await cms.listPages();

  return (
    <AdminShell
      title="Pages"
      subtitle="Find a page and open its editor."
      breadcrumbs={[{ label: "Content" }, { label: "Pages" }]}
    >
      {pages.length === 0 ? (
        <EmptyState title="No pages yet" description="CMS pages will appear here once available." />
      ) : (
        <DataTableShell>
          <TableScroll className="hidden md:block">
            <DataTable>
              <TableHead>
                <tr>
                  <Th>Name</Th>
                  <Th hideBelow="md">Public path</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </TableHead>
              <tbody>
                {pages.map((page) => {
                  const href = editorHrefForPageId(page.id);
                  return (
                    <TableRow key={page.id}>
                      <Td className="font-medium">{page.name}</Td>
                      <Td hideBelow="md" className="font-mono text-xs text-muted">
                        {page.slug}
                      </Td>
                      <Td>
                        <StatusBadge tone={page.cmsEnabled ? "success" : "neutral"}>
                          {page.cmsEnabled ? "CMS enabled" : "Not enabled"}
                        </StatusBadge>
                      </Td>
                      <Td>
                        {href ? (
                          <ListActions>
                            <ListActionLink href={href}>Edit</ListActionLink>
                          </ListActions>
                        ) : (
                          <span className="text-muted">No editor</span>
                        )}
                      </Td>
                    </TableRow>
                  );
                })}
              </tbody>
            </DataTable>
          </TableScroll>
          <ListStack>
            {pages.map((page) => {
              const href = editorHrefForPageId(page.id);
              return (
                <ListCard key={page.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{page.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">{page.slug}</p>
                    </div>
                    <StatusBadge tone={page.cmsEnabled ? "success" : "neutral"}>
                      {page.cmsEnabled ? "CMS enabled" : "Not enabled"}
                    </StatusBadge>
                  </div>
                  {href ? (
                    <ListActions>
                      <ListActionLink href={href}>Edit</ListActionLink>
                    </ListActions>
                  ) : (
                    <span className="text-sm text-muted">No editor</span>
                  )}
                </ListCard>
              );
            })}
          </ListStack>
        </DataTableShell>
      )}
    </AdminShell>
  );
}
