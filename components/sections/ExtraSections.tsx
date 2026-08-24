import { Clock3, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { isPlaceholderPhone, telUrl, whatsappUrl } from "@/lib/cms/contact";
import type {
  ContactFormData,
  ContactInfoData,
  HoursData,
  InfoCardsData,
  MessagingCtaData,
  RichTextData,
  SiteSettings,
} from "@/lib/cms/types";
import { getIcon } from "@/lib/cms/icons";
import { ContactForm } from "@/components/contact/ContactForm";

export function RichTextBlock({ data }: { data: RichTextData }) {
  return (
    <section className="bg-white py-12">
      <Container className="max-w-3xl">
        {data.heading ? <h2 className="text-2xl font-extrabold text-ink">{data.heading}</h2> : null}
        <div
          className="prose-cms mt-4 text-sm leading-relaxed text-muted"
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      </Container>
    </section>
  );
}

export function InfoCards({ data }: { data: InfoCardsData }) {
  return (
    <section className="bg-paper py-20">
      <Container>
        <SectionHeading
          eyebrow={data.eyebrow || undefined}
          title={data.heading}
          description={data.description || undefined}
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {data.cards.map((card) => {
            const Icon = getIcon(card.icon);
            return (
              <article key={card.id} className="rounded-xl border border-line bg-white p-6 shadow-sm">
                <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{card.description}</p>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

export function ContactInfoCards({ data, settings }: { data: ContactInfoData; settings: SiteSettings }) {
  const wa = whatsappUrl(settings.whatsapp, settings.whatsappMessage);
  const cards = [
    settings.email
      ? { icon: Mail, title: "Email", value: settings.email, href: `mailto:${settings.email}` }
      : null,
    settings.phone && !isPlaceholderPhone(settings.phone)
      ? { icon: Phone, title: "Phone", value: settings.whatsappDisplay || settings.phone, href: telUrl(settings.phone) }
      : null,
    wa ? { icon: MessageCircle, title: "WhatsApp", value: settings.whatsappDisplay || "Chat on WhatsApp", href: wa } : null,
    settings.hours ? { icon: Clock3, title: "Hours", value: settings.hours, href: undefined } : null,
  ].filter(Boolean) as Array<{ icon: typeof Mail; title: string; value: string; href?: string }>;

  return (
    <section className="bg-white py-16">
      <Container>
        <SectionHeading title={data.heading} description={data.description || undefined} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <article key={card.title} className="rounded-xl border border-line bg-paper p-5">
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
      </Container>
    </section>
  );
}

export function ContactFormBlock({ data }: { data: ContactFormData }) {
  return (
    <section className="bg-white py-8">
      <Container className="max-w-3xl">
        <h2 className="text-2xl font-extrabold text-ink">{data.heading}</h2>
        {data.description ? <p className="mt-2 text-sm text-muted">{data.description}</p> : null}
        <div className="mt-6">
          <ContactForm labels={data} />
        </div>
      </Container>
    </section>
  );
}

export function MessagingCta({ data, settings }: { data: MessagingCtaData; settings: SiteSettings }) {
  const wa = whatsappUrl(settings.whatsapp, settings.whatsappMessage);
  const telegram = settings.telegramUrl || settings.socials.telegram;
  return (
    <section className="bg-ink py-16 text-white">
      <Container className="max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold">{data.heading}</h2>
        <p className="mt-3 text-sm text-white/70">{data.description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {wa ? (
            <a href={wa} className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-5 py-3 text-sm font-semibold text-white">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {data.whatsappLabel}
            </a>
          ) : null}
          {telegram ? (
            <a href={telegram} className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold">
              <Send className="h-4 w-4" aria-hidden="true" />
              {data.telegramLabel}
            </a>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

export function SupportHours({ data, settings }: { data: HoursData; settings: SiteSettings }) {
  return (
    <section className="bg-paper py-12">
      <Container className="max-w-3xl text-center">
        <h2 className="text-2xl font-extrabold text-ink">{data.heading}</h2>
        <p className="mt-3 text-sm text-muted">{settings.hours || data.description}</p>
        {settings.location ? <p className="mt-2 text-sm text-muted">{settings.location}</p> : null}
      </Container>
    </section>
  );
}
