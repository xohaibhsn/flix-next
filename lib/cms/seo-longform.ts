import { assertProfessionalSeedCopy, containsLeakedDevCopy, isExactTestTitle } from "@/lib/cms/dev-copy";
import type { CmsPage, CmsSection, RichContentData } from "@/lib/cms/types";

export const SEO_LONGFORM_HOME_ID = "sec-home-seo-longform";
export const SEO_LONGFORM_SUB_ID = "sec-sub-seo-longform";

const PLACEHOLDER_SNIPPETS = [
  "write a longer description, comparison, or seo article block here",
  "use this block for a longer seo description",
  "add your content here",
  "write the long description",
];

export function plainTextFromHtml(html: string) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCountFromHtml(html: string) {
  const text = plainTextFromHtml(html);
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}

export function isPlaceholderRichHtml(html: string) {
  const text = plainTextFromHtml(html).toLowerCase();
  if (text.length < 80) return true;
  return PLACEHOLDER_SNIPPETS.some((snippet) => text.includes(snippet));
}

export function isLeakedTestRichContent(section: CmsSection) {
  if (section.type !== "rich-content") return false;
  const data = section.data as RichContentData;
  const html = typeof data.html === "string" ? data.html : "";
  if (containsLeakedDevCopy(`${data.eyebrow || ""} ${data.heading || ""} ${html}`)) return true;
  return isExactTestTitle(data.heading || "") || isExactTestTitle(data.eyebrow || "");
}

export const HOME_SEO_HTML = `<p>British households do not need another complicated entertainment setup. They need something that works on the telly already in the living room, and on the phone when someone is upstairs. The Flix is a UK streaming service built around that idea: live TV, films and series through familiar streaming apps, with setup handled in a conversation rather than a pile of instructions.</p>
<p>If you have been comparing streaming packages and want a straightforward option for Firestick, Fire TV, Smart TV, Android TV, tablets and laptops, this page explains how The Flix fits a typical British home. Some people still search for IPTV; we describe the same thing in plainer language: a streaming subscription you can actually use day to day.</p>
<h2>Watch on the devices you already use</h2>
<p>Most customers already own the hardware. Firestick streaming is common in the UK because a Fire TV Stick is small, cheap to run, and sits behind the television. If you already have Fire TV, you can add the streaming apps you need and watch from the sofa. We do not sell or post devices. When people talk about a Fully Loaded Firestick experience, they usually mean Firestick with the right apps installed — not a parcel arriving in the post.</p>
<p>Smart TVs and Android TV boxes are just as relevant. Many living rooms already have a set with apps built in. Phones and tablets are useful for a second screen, travel, or the spare room. A laptop works when you want a larger picture at the desk without turning the main television on.</p>
<p>The point is flexibility. You should not have to buy a new box for every room. Multi-device streaming, where your plan allows it, means the household can watch in the way that already fits the house.</p>
<h3>Firestick and Fire TV in UK homes</h3>
<p>Firestick remains one of the easiest ways to add streaming apps to an older television. The remote is familiar, the home screen is simple, and most people in the UK already know how to plug one in. If you are starting from a Fire TV Stick, message us on WhatsApp and we will talk through the steps for your model rather than sending you a generic guide that may not match what you own.</p>
<h3>Smart TV, mobile, tablet and laptop</h3>
<p>A newer Smart TV can often run the same kind of TV apps without extra hardware. Android TV, phones, tablets and laptops cover the rest of the house. If you are unsure whether a particular screen is a good fit, ask on WhatsApp before you commit — it is quicker than guessing from a spec sheet.</p>
<h2>A simple setup through WhatsApp</h2>
<p>We do not send login details or setup instructions by email. When you are ready, contact us on WhatsApp. That is where you receive account information, device help, and answers if something does not look right on the first evening.</p>
<p>A typical start looks like this: you choose a streaming package, you message the team on WhatsApp, and we help you get the apps running on the device you actually use. If you have a Firestick in the lounge and a tablet for the kitchen, say so. Setup is much smoother when we know the household layout.</p>
<p>WhatsApp support also matters later. Remote controls go missing, a television gets replaced, or a new phone needs the same apps. You should not have to open a ticket and wait. Message us on WhatsApp and we will pick it up.</p>
<h2>Flexible streaming for UK homes</h2>
<p>UK streaming should feel ordinary: the news in the morning, a film on Friday, sport when it is on, something for the children at the weekend. The Flix is aimed at that rhythm, not at people who want to tinker with settings all evening.</p>
<p>Live TV streaming sits alongside on-demand titles, so you are not locked into one way of watching. Entertainment streaming on the main television still matters most, but it helps when the same subscription can follow you to a tablet if the living room is busy.</p>
<p>Plans are listed on our IPTV Subscription page. View the current streaming packages there, then message us on WhatsApp if you want a recommendation for your devices.</p>
<h2>Why customers choose The Flix</h2>
<p>People stay with a streaming service when it is easy to start, easy to ask a question, and honest about what happens if it is not a fit. We do not claim to be the number one provider in the United Kingdom, and we will not invent channel counts or uptime badges to sound bigger than we are.</p>
<p>What we do offer is a UK-focused streaming subscription, setup through WhatsApp, and a 7-Day Money Back Guarantee if the service is not suitable. That combination is enough for many British households: Firestick or Smart TV in the lounge, a phone for later, and a person on the other end of WhatsApp if you get stuck.</p>
<ul>
<li>Setup and account help through WhatsApp, not email</li>
<li>Streaming on Firestick, Fire TV, Smart TV, Android TV, mobile, tablet and laptop</li>
<li>Plan choices you can review before you message us</li>
<li>A 7-Day Money Back Guarantee if it is not the right fit</li>
</ul>
<h2>7-Day Money Back Guarantee</h2>
<p>If The Flix is not suitable, contact us on WhatsApp within the applicable 7-day guarantee period. It is a simple trust point: try the service, see how it feels on your own television, and tell us if it is not working for your household. We will not dress that up as “risk free forever”. Seven days is seven days, and WhatsApp is how you raise it.</p>
<p>Use those first days to check the devices you care about most. If Firestick streaming in the living room is the whole point, test that first. If you also need a tablet upstairs, try that too before the guarantee window closes.</p>
<h2>Help when you need it</h2>
<p>Questions about Fire TV, a Smart TV app that will not open, or which streaming package to pick are all fair game. Get help through WhatsApp. If you would rather browse first, the subscription page has current plans, and the Contact page collects other details for the business — but sales, setup and account help should start on WhatsApp.</p>
<p>The Flix is here for UK customers who want television that is easy to live with. Message us on WhatsApp when you are ready to get started.</p>`;

export const SUBSCRIPTION_SEO_HTML = `<p>This page is for UK customers who want a streaming subscription they can use on the television they already own. The Flix offers streaming packages for Firestick, Fire TV, Smart TV, Android TV, mobile, tablet and laptop, with setup and account help through WhatsApp. You will see the word IPTV in the address bar because that is how many people still search; the service itself is easier to understand as live TV streaming and on-demand entertainment in one place.</p>
<p>Choose a plan from the packages above, then message us on WhatsApp. We do not email login details or setup steps. WhatsApp is how you receive account information and how you get help if a device needs a second look.</p>
<h2>Streaming on Firestick and Fire TV</h2>
<p>Firestick streaming is the usual starting point for a lot of British living rooms. A Fire TV Stick turns an ordinary television into a place for streaming apps, without replacing the set. If you already own Fire TV, you are most of the way there. We can talk you through the apps on WhatsApp so you are not copying a guide written for a different model.</p>
<p>A Fully Loaded Firestick experience, in the way customers usually mean it, is about having the right TV apps ready on Firestick — not about us posting a stick in the mail. The Flix does not sell hardware. Bring the Fire TV you have, or buy one locally if you still need one, then we will help with the streaming side.</p>
<p>Fire TV is also useful in a second room. A smaller set in the kitchen or a bedroom can use the same kind of Firestick streaming, subject to your plan. If you are covering more than one screen, say so on WhatsApp when you get in touch so the setup matches the house.</p>
<h3>What Firestick users in the UK usually want</h3>
<p>They want the remote to feel familiar, the picture to be watchable in the evening, and a person to message if an app asks for a step they have not seen before. That is the bar. You should not need a weekend of tinkering. Contact us on WhatsApp, tell us it is a Firestick or Fire TV, and we will keep the instructions to what you actually need.</p>
<h2>Stream on Smart TV, Android TV, mobile and laptop</h2>
<p>Not every home is a Firestick home. Plenty of UK customers have a Smart TV with apps already on the set, or an Android TV box from a previous setup. Mobile and tablet streaming covers travel, the garden, and the times the main television is busy. A laptop is a sensible extra when you want a bigger picture without sitting in the lounge.</p>
<p>Multi-device streaming depends on the package you choose and the devices you name when you message us. We will not promise a number of connections that is not on your plan. If two rooms need to watch at once, ask on WhatsApp before you start so you pick a streaming package that fits.</p>
<p>TV apps differ slightly by screen. A Smart TV menu is not identical to Fire TV, and a phone is not identical to a laptop. That is normal. WhatsApp support exists so you are not left comparing three different layouts on your own.</p>
<h2>Simple setup through WhatsApp</h2>
<p>Once you have looked at the streaming packages above, message us on WhatsApp. That conversation is where setup happens: which device you will use first, how to open the apps, and where to find the account details. Receive setup details through WhatsApp, not through an email inbox you might never check on the television remote.</p>
<p>If something fails on night one — a code that will not stick, an app that needs a refresh — speak to our team on WhatsApp. It is faster than guessing, and it keeps your account and your devices in the same thread.</p>
<h3>What we will ask</h3>
<p>Expect simple questions: Firestick or Smart TV? One television or more? Anyone else in the house who needs the same apps on a tablet? The clearer the picture, the quicker the setup. You do not need technical language. “It is the telly in the front room and a phone” is enough to start.</p>
<h2>A UK-focused streaming experience</h2>
<p>UK streaming is its own habit. People want the news, sport when it is on, a film without a lecture, and something on in the background on a Sunday. A streaming subscription for British households should respect that. The Flix is organised around everyday watching, not around a marketing list of countries and servers.</p>
<p>Searches for IPTV subscriptions in the UK often mean the same practical need: live channels and on-demand titles on a Firestick or Smart TV, without a second satellite dish. We keep the language plain so you know what you are signing up for. If a friend forwarded you an IPTV link, this page is still the right place to compare packages and then continue on WhatsApp.</p>
<p>You remain in control of the plan you pick. This page does not freeze prices in the article because packages can change. View our current streaming packages above, then decide. If you want a steer for Firestick versus Smart TV, ask on WhatsApp — that is a better use of five minutes than comparing outdated numbers in a blog post.</p>
<h2>What to expect from your subscription</h2>
<p>A The Flix subscription is meant to be ordinary in the best sense: you pay for a streaming package, you set it up with help, and you watch on the devices you already have.</p>
<ul>
<li>Straightforward setup through WhatsApp, including account information</li>
<li>Streaming apps for Firestick, Fire TV, Smart TV, Android TV, mobile, tablet and laptop where your plan supports them</li>
<li>A conversation if you add a device later or replace a television</li>
<li>Plan choices listed on this page, without duplicating prices in this article</li>
<li>A 7-Day Money Back Guarantee if the service is not suitable</li>
</ul>
<p>We will not invent a channel count, a film library size, or a buffering promise. Those figures go stale and they are easy to get wrong. What you can hold us to is the setup path, the devices we have listed, and the guarantee below.</p>
<h2>7-Day Money Back Guarantee</h2>
<p>Try with confidence, within a clear window. If the service is not suitable, contact us on WhatsApp within the applicable 7-day guarantee period. Use that week on the screens that actually matter to you — usually the main television first, then the phone or tablet if you need them.</p>
<p>The guarantee is not a slogan for “forever, no questions, no time limit”. It is seven days, handled on WhatsApp, so we can see what went wrong and sort the account without a long email chain.</p>
<h2>Choosing the right streaming package</h2>
<p>Start with how you watch. If Firestick streaming on one television is the whole household, say that. If you also want Android TV in another room, or a laptop at the weekend, say that too. Then look at the packages above. Names and prices live with the pricing list so this guide cannot drift out of date.</p>
<p>Think about evenings, not spec sheets. A quieter household may only need the main television. A busy house may want a tablet upstairs as well. Neither is “better”; they are different. The pricing block at the top of this page is the source of truth for what each streaming package includes at the moment you read it.</p>
<p>If two packages look similar, message us on WhatsApp rather than overthinking it. We would rather you pick once than switch three times in a week. There is no prize for choosing the most complicated option.</p>
<h2>Need help getting started?</h2>
<p>When you are ready, contact us on WhatsApp. Tell us you are looking at a UK streaming subscription, name the devices in the house, and we will send setup details through WhatsApp. For plan comparisons, stay on this page and use the packages above. For everything that gets you watching on the night, WhatsApp is the right door.</p>`;

function homeData(): RichContentData {
  return {
    eyebrow: "For UK homes",
    heading: "UK streaming made simple",
    html: HOME_SEO_HTML,
    buttonLabel: "Message us on WhatsApp",
    buttonHref: "",
    width: "normal",
    scrollable: true,
    scrollHeight: "standard",
    ctaSource: "whatsapp",
  };
}

function subscriptionData(): RichContentData {
  return {
    eyebrow: "UK streaming packages",
    heading: "Streaming subscriptions for UK customers",
    html: SUBSCRIPTION_SEO_HTML,
    buttonLabel: "Message us on WhatsApp",
    buttonHref: "",
    width: "normal",
    scrollable: true,
    scrollHeight: "tall",
    ctaSource: "whatsapp",
  };
}

export const HOME_SEO_LONGFORM = homeData();
export const SUBSCRIPTION_SEO_LONGFORM = subscriptionData();

type PageSpec = {
  slug: string;
  id: string;
  label: string;
  preferredIds: string[];
  data: RichContentData;
};

const SPECS: PageSpec[] = [
  {
    slug: "/",
    id: SEO_LONGFORM_HOME_ID,
    label: "Rich Content / Long Description",
    preferredIds: [SEO_LONGFORM_HOME_ID, "sec-home-rich-content"],
    data: HOME_SEO_LONGFORM,
  },
  {
    slug: "/iptv-subscriptions-uk/",
    id: SEO_LONGFORM_SUB_ID,
    label: "Rich Content / Long Description",
    preferredIds: [SEO_LONGFORM_SUB_ID, "sec-sub-longform"],
    data: SUBSCRIPTION_SEO_LONGFORM,
  },
];

function reindex(sections: CmsSection[]) {
  return sections.map((section, index) => ({ ...section, order: index + 1 }));
}

function isPlaceholderSection(section: CmsSection) {
  if (section.type !== "rich-content") return false;
  const html = typeof (section.data as RichContentData).html === "string" ? (section.data as RichContentData).html : "";
  return isPlaceholderRichHtml(html);
}

function isReplaceableRichSection(section: CmsSection) {
  return isPlaceholderSection(section) || isLeakedTestRichContent(section);
}

function hasCustomLongform(sections: CmsSection[]) {
  return sections.some((section) => {
    if (section.type !== "rich-content") return false;
    const html = typeof (section.data as RichContentData).html === "string" ? (section.data as RichContentData).html : "";
    return !isReplaceableRichSection(section) && wordCountFromHtml(html) >= 250;
  });
}

function fillRichContent(section: CmsSection, spec: PageSpec): CmsSection {
  return {
    ...section,
    label: spec.label,
    data: {
      ...spec.data,
      scrollable: true,
      scrollHeight: spec.data.scrollHeight,
      width: spec.data.width,
    },
  };
}

export function applySeoLongformToPage(page: CmsPage): { page: CmsPage; changed: boolean } {
  const spec = SPECS.find((item) => item.slug === page.slug);
  if (!spec) return { page, changed: false };

  let sections = [...page.sections].sort((a, b) => a.order - b.order);
  const leaked = sections.filter((section) => isLeakedTestRichContent(section));
  const professional = hasCustomLongform(sections);

  if (leaked.length && professional) {
    const drop = new Set(leaked.map((section) => section.id));
    return {
      page: { ...page, sections: reindex(sections.filter((section) => !drop.has(section.id))) },
      changed: true,
    };
  }

  if (leaked.length) {
    const [first, ...extras] = leaked;
    const drop = new Set(extras.map((section) => section.id));
    sections = sections
      .filter((section) => !drop.has(section.id))
      .map((section) => (section.id === first.id ? fillRichContent(section, spec) : section));
    return { page: { ...page, sections: reindex(sections) }, changed: true };
  }

  const rich = sections.filter((section) => section.type === "rich-content");
  const byId = rich.find((section) => spec.preferredIds.includes(section.id));
  const placeholder = rich.find((section) => isPlaceholderSection(section));

  if (byId && !isReplaceableRichSection(byId)) {
    return { page, changed: false };
  }

  const target = byId && isReplaceableRichSection(byId) ? byId : placeholder;

  if (!target && professional) {
    return { page, changed: false };
  }

  if (target) {
    const next = sections.map((section) => (section.id === target.id ? fillRichContent(section, spec) : section));
    return { page: { ...page, sections: reindex(next) }, changed: true };
  }

  const faqIndex = sections.findIndex((section) => section.type === "faq");
  const ctaIndex = sections.findIndex((section) => section.type === "cta");
  const insertAt = faqIndex >= 0 ? faqIndex : ctaIndex >= 0 ? ctaIndex : sections.length;
  const created: CmsSection = {
    id: spec.id,
    type: "rich-content",
    label: spec.label,
    order: insertAt + 1,
    visible: true,
    data: spec.data,
  };
  const next = [...sections.slice(0, insertAt), created, ...sections.slice(insertAt)];
  return { page: { ...page, sections: reindex(next) }, changed: true };
}

export function applySeoLongformToPages(pages: CmsPage[]) {
  let changed = false;
  const next = pages.map((page) => {
    const result = applySeoLongformToPage(page);
    if (result.changed) changed = true;
    return result.page;
  });
  return { pages: next, changed };
}

assertProfessionalSeedCopy(HOME_SEO_HTML, "Home SEO longform");
assertProfessionalSeedCopy(SUBSCRIPTION_SEO_HTML, "Subscription SEO longform");
assertProfessionalSeedCopy(HOME_SEO_LONGFORM.heading, "Home SEO heading");
assertProfessionalSeedCopy(SUBSCRIPTION_SEO_LONGFORM.heading, "Subscription SEO heading");
