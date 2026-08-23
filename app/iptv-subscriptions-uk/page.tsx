import { CTA } from "@/components/sections/CTA";
import { Devices } from "@/components/sections/Devices";
import { FAQ } from "@/components/sections/FAQ";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Pricing } from "@/components/sections/Pricing";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { subscriptionPage } from "@/lib/demo-content";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata(
    "IPTV Subscriptions UK",
    "Local demo page for The Flix IPTV subscriptions. Plans, benefits, devices, and FAQs — checkout is not connected yet.",
    "/iptv-subscriptions-uk/",
  );
}

export default function SubscriptionsPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow={subscriptionPage.eyebrow}
        title={subscriptionPage.title}
        accent={subscriptionPage.titleAccent}
        description={subscriptionPage.intro}
      />
      <section className="bg-white py-12">
        <Container className="max-w-3xl">
          <p className="text-sm leading-relaxed text-muted">
            Local placeholder intro: plans, benefits, setup, and FAQs below. WordPress
            SEO copy is not imported yet.
          </p>
        </Container>
      </section>
      <Pricing />
      <section className="bg-paper py-20">
        <Container>
          <SectionHeading
            title="Why subscribers choose The Flix"
            description="Placeholder benefit blocks. Final copy will come from CMS later."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {subscriptionPage.benefits.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-line bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
      <HowItWorks />
      <Devices />
      <section className="bg-white py-20">
        <Container>
          <SectionHeading title="Good to know" description="Structured informational content for later SEO replacement." />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {subscriptionPage.infoBlocks.map((block) => (
              <article key={block.title} className="rounded-xl border border-line bg-paper p-6">
                <h3 className="font-bold text-ink">{block.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{block.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
      <WhyChooseUs />
      <FAQ />
      <CTA
        data={{
          heading: "Ready to choose a plan?",
          description: "Use Contact for this local preview. Payment is not live yet.",
          buttonLabel: "Talk to support",
          buttonHref: "/contact/",
        }}
      />
    </SiteShell>
  );
}
