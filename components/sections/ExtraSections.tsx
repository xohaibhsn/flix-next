import { Clock3, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { renderCmsHtml } from "@/lib/cms/html";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { publicEmail, publicPhone, publicPhoneHref, publicTelegramUrl, publicWhatsAppSalesUrl } from "@/lib/cms/public-contact";
import { isSalesCtaLabel } from "@/lib/cms/whatsapp-messages";
import { externalAnchorProps } from "@/lib/cms/contact";
import type {
  ContactFormData,
  ContactInfoData,
  HoursData,
  InfoCardsData,
  MessagingCtaData,
  RichContentData,
  RichTextData,
  SiteSettings,
} from "@/lib/cms/types";
import { getIcon } from "@/lib/cms/icons";
import { ContactForm } from "@/components/contact/ContactForm";
import { ButtonLink } from "@/components/ui/ButtonLink";

export function RichTextBlock({ data }: { data: RichTextData }) {
  return (
    <section className="bg-white py-12">
      <Container className="max-w-3xl">
        {data.heading ? <h2 className="text-2xl font-extrabold text-ink">{data.heading}</h2> : null}
        <div
          className="prose-cms mt-4 text-sm leading-relaxed text-muted"
          dangerouslySetInnerHTML={{ __html: renderCmsHtml(data.html) }}
        />
      </Container>
    </section>
  );
}

const RICH_WIDTH = {
  narrow: "max-w-3xl",
  normal: "max-w-4xl",
  wide: "",
} as const;

const RICH_SCROLL_HEIGHT = {
  compact: "rich-scroll rich-scroll-compact",
  standard: "rich-scroll rich-scroll-standard",
  tall: "rich-scroll rich-scroll-tall",
} as const;

export function RichContentBlock({
  data,
  settings,
}: {
  data: RichContentData;
  settings?: SiteSettings;
}) {
  const width = RICH_WIDTH[data.width] || RICH_WIDTH.narrow;
  const html = renderCmsHtml(data.html);
  const whatsappHref = settings ? publicWhatsAppSalesUrl(settings) : "";
  const ctaHref =
    data.ctaSource === "whatsapp" || (whatsappHref && isSalesCtaLabel(data.buttonLabel))
      ? whatsappHref
      : data.buttonHref;
  const showCta = Boolean(data.buttonLabel && ctaHref);
  const body = (
    <div
      className="prose-cms text-[15px] leading-relaxed text-ink/80"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );

  return (
    <section className="bg-white py-16">
      <Container className={width}>
        {data.eyebrow ? (
          <p className="text-xs font-bold tracking-[0.18em] text-brand uppercase">{data.eyebrow}</p>
        ) : null}
        {data.heading ? (
          <h2 className={`text-3xl font-extrabold text-ink ${data.eyebrow ? "mt-3" : ""}`}>{data.heading}</h2>
        ) : null}
        {data.scrollable ? (
          <div
            className={`rounded-xl border border-line bg-white p-5 shadow-sm sm:p-7 ${data.heading || data.eyebrow ? "mt-6" : ""} ${RICH_SCROLL_HEIGHT[data.scrollHeight] || RICH_SCROLL_HEIGHT.standard}`}
            tabIndex={0}
          >
            {body}
          </div>
        ) : (
          <div className={data.heading || data.eyebrow ? "mt-6" : ""}>{body}</div>
        )}
        {showCta ? (
          <ButtonLink href={ctaHref} className="mt-8">
            {data.buttonLabel}
          </ButtonLink>
        ) : null}
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
  const wa = publicWhatsAppSalesUrl(settings);
  const email = publicEmail(settings);
  const phone = publicPhone(settings);
  const phoneHref = publicPhoneHref(settings);
  const cards = [
    wa ? { icon: MessageCircle, title: "WhatsApp", value: settings.whatsappDisplay || "Chat on WhatsApp", href: wa, primary: true } : null,
    email ? { icon: Mail, title: "Email", value: email, href: `mailto:${email}`, primary: false } : null,
    phone && phoneHref
      ? { icon: Phone, title: "Phone", value: settings.whatsappDisplay || phone, href: phoneHref, primary: false }
      : null,
    settings.hours ? { icon: Clock3, title: "Hours", value: settings.hours, href: undefined, primary: false } : null,
  ].filter(Boolean) as Array<{
    icon: typeof Mail;
    title: string;
    value: string;
    href?: string;
    primary: boolean;
  }>;

  return (
    <section className="bg-white py-16">
      <Container>
        <SectionHeading title={data.heading} description={data.description || undefined} />
        {wa ? (
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-[#25D366]/25 bg-[#25D366]/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="max-w-xl">
              <h3 className="text-lg font-bold text-ink">Chat on WhatsApp</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                For subscriptions, payment details, setup and support, message our team directly on WhatsApp.
              </p>
            </div>
            <a
              href={wa}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
              {...externalAnchorProps(wa)}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Chat on WhatsApp
            </a>
          </div>
        ) : null}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.title}
              className={`rounded-xl border p-5 ${
                card.primary ? "border-[#25D366]/40 bg-[#25D366]/5" : "border-line bg-paper"
              }`}
            >
              <card.icon className={`h-5 w-5 ${card.primary ? "text-[#25D366]" : "text-brand"}`} aria-hidden="true" />
              <h2 className="mt-3 font-bold text-ink">{card.title}</h2>
              {card.href ? (
                <a
                  href={card.href}
                  className="mt-1 block text-sm text-muted hover:text-brand"
                  {...externalAnchorProps(card.href)}
                >
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
  const wa = publicWhatsAppSalesUrl(settings);
  const telegram = publicTelegramUrl(settings);
  return (
    <section className="bg-ink py-16 text-white">
      <Container className="max-w-3xl text-center">
        <h2 className="text-3xl font-extrabold">{data.heading}</h2>
        <p className="mt-3 text-sm text-white/70">{data.description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {wa ? (
            <a
              href={wa}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#25D366] px-5 py-3 text-sm font-semibold text-white"
              {...externalAnchorProps(wa)}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {data.whatsappLabel}
            </a>
          ) : null}
          {telegram ? (
            <a
              href={telegram}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold"
              {...externalAnchorProps(telegram)}
            >
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
