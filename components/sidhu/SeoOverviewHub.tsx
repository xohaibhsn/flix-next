import Link from "next/link";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";

export type SeoOverviewHubProps = {
  inventoryCount: number;
  lastScanAt: string | null;
  openFindingCount: number | null;
};

type HubCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  meta?: string | null;
};

function formatScanStamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SeoOverviewHub({ inventoryCount, lastScanAt, openFindingCount }: SeoOverviewHubProps) {
  const scanLabel = formatScanStamp(lastScanAt);
  const healthMeta = scanLabel
    ? openFindingCount === null
      ? `Last saved scan: ${scanLabel}.`
      : `Last saved scan: ${scanLabel}. ${openFindingCount} open finding${openFindingCount === 1 ? "" : "s"} from last scan.`
    : "No SEO Health scan has been run yet.";

  const cards: HubCard[] = [
    {
      id: "issues",
      title: "SEO Health",
      description: "Review detected SEO issues with issue memory and optional Sidhu AI explanations.",
      href: "/sidhu/seo/health/",
      actionLabel: "Open Issues",
      meta: healthMeta,
    },
    {
      id: "content",
      title: "Content SEO",
      description: "Inventory of page, post, and category metadata with edit links.",
      href: "/sidhu/seo/content/",
      actionLabel: "Open Content",
      meta: `${inventoryCount} item${inventoryCount === 1 ? "" : "s"} in the inventory.`,
    },
    {
      id: "metadata",
      title: "Metadata",
      description: "Duplicate title, description, and canonical diagnostics.",
      href: "/sidhu/seo/metadata-diagnostics/",
      actionLabel: "Open Metadata",
    },
    {
      id: "links",
      title: "Internal Links",
      description: "Internal href and orphan diagnostics across CMS content and navigation.",
      href: "/sidhu/seo/internal-links/",
      actionLabel: "Open Links",
    },
    {
      id: "media",
      title: "Media SEO",
      description: "Image and alt coverage diagnostics for media, heroes, and rich HTML.",
      href: "/sidhu/seo/image-diagnostics/",
      actionLabel: "Open Media",
    },
    {
      id: "advanced",
      title: "Advanced / Schema",
      description: "Site-wide custom JSON-LD schema used across the public site.",
      href: "/sidhu/seo/advanced/",
      actionLabel: "Open Advanced",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <SectionCard key={card.id} className="flex h-full flex-col gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-ink">{card.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{card.description}</p>
              {card.meta ? <p className="mt-2 text-xs text-muted">{card.meta}</p> : null}
            </div>
            <div>
              <Link href={card.href} className={sidhuButtonClass("secondary", "min-h-9")}>
                {card.actionLabel}
              </Link>
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard padding="sm">
        <h2 className="text-sm font-semibold text-ink">AI SEO Assistant</h2>
        <p className="mt-1 text-sm text-muted">
          AI explanations and metadata drafting are available inside SEO findings and editors. Nothing runs from this
          overview.
        </p>
      </SectionCard>
    </div>
  );
}
