import { Clock3, Mail, MessageCircle, Phone } from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";
import { FAQ } from "@/components/sections/FAQ";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { contactFaqs } from "@/lib/demo-content";
import { siteConfig, whatsappLink } from "@/lib/site-config";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata(
    "Contact",
    "Contact THE FLIX IPTV support. WhatsApp, email, and a local UI-only contact form — messages are not sent yet.",
    "/contact/",
  );
}

const cards = [
  {
    icon: Mail,
    title: "Email",
    value: siteConfig.email,
    href: `mailto:${siteConfig.email}`,
  },
  {
    icon: Phone,
    title: "Phone",
    value: siteConfig.phone,
    href: `tel:${siteConfig.phone}`,
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    value: "Chat on WhatsApp",
    href: whatsappLink,
  },
  {
    icon: Clock3,
    title: "Hours",
    value: siteConfig.hours,
    href: undefined,
  },
];

export default function ContactPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Support"
        title="Contact"
        accent="The Flix"
        description="Placeholder contact details for local development. The form is UI only and does not send email."
      />
      <section className="bg-white py-16">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <article
                key={card.title}
                className="rounded-xl border border-line bg-paper p-5"
              >
                <card.icon className="h-5 w-5 text-brand" aria-hidden="true" />
                <h2 className="mt-3 font-bold text-ink">{card.title}</h2>
                {card.href ? (
                  <a href={card.href} className="mt-1 block text-sm text-muted hover:text-brand">
                    {card.value}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-muted">{card.value}</p>
                )}
              </article>
            ))}
          </div>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="text-2xl font-extrabold text-ink">Send a message</h2>
              <p className="mt-2 text-sm text-muted">
                Fields are for layout review. Submitting shows a local preview notice only.
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>
            <aside className="rounded-xl bg-ink p-8 text-white">
              <h2 className="text-xl font-bold">Prefer WhatsApp?</h2>
              <p className="mt-3 text-sm text-white/70">
                Most setup questions are faster in chat. The number below is a demo placeholder.
              </p>
              <a
                href={whatsappLink}
                className="mt-6 inline-flex rounded-md bg-[#25D366] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
              >
                Open WhatsApp
              </a>
              <p className="mt-6 text-xs text-white/45">{siteConfig.location}</p>
            </aside>
          </div>
        </Container>
      </section>
      <FAQ
        data={{
          eyebrow: "",
          heading: "Quick help",
          description: "Short answers while we wait for the live help center content.",
          items: contactFaqs.map((item, index) => ({
            id: `contact-faq-${index}`,
            question: item.question,
            answer: item.answer,
          })),
        }}
      />
    </SiteShell>
  );
}
