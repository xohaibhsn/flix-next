import type { CmsPage, CmsSection, NavLink, PageSeo } from "@/lib/cms/types";
import { defaultPageSeo } from "@/lib/seo";

export const COMPANY_PAGE_SEO_KEYS = [
  "about",
  "terms",
  "refund",
  "privacy",
  "cookie",
  "copyright",
] as const;

export type CompanyPageSeoKey = (typeof COMPANY_PAGE_SEO_KEYS)[number];

export function isCompanyPageSeoKey(value: string): value is CompanyPageSeoKey {
  return (COMPANY_PAGE_SEO_KEYS as readonly string[]).includes(value);
}

export type CompanyPageDefinition = {
  seoKey: CompanyPageSeoKey;
  id: string;
  name: string;
  slug: string;
  adminParam: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  hero: {
    eyebrow: string;
    heading: string;
    highlight: string;
    description: string;
  };
  html: string;
};

function nav(id: string, label: string, href: string): NavLink {
  return { id, label, href, visible: true };
}

function buildCompanyPages(): CompanyPageDefinition[] {
  return [
  {
    seoKey: "about",
    id: "page-about",
    name: "About Us",
    slug: "/about-us/",
    adminParam: "about-us",
    seoTitle: "About Flix IPTV",
    seoDescription:
      "Learn what Flix IPTV is, how UK streaming subscriptions work, and how to get help on WhatsApp.",
    focusKeyword: "Flix IPTV",
    hero: {
      eyebrow: "Company",
      heading: "About",
      highlight: "Flix IPTV",
      description: "A UK-focused streaming subscription with straightforward setup and WhatsApp support.",
    },
    html: ABOUT_HTML,
  },
  {
    seoKey: "terms",
    id: "page-terms",
    name: "Terms & Conditions",
    slug: "/terms-and-conditions/",
    adminParam: "terms-and-conditions",
    seoTitle: "Terms & Conditions",
    seoDescription: "Terms that govern use of this Flix IPTV website and streaming subscription services.",
    focusKeyword: "terms",
    hero: {
      eyebrow: "Legal",
      heading: "Terms & Conditions",
      highlight: "",
      description: "These terms govern use of this Flix IPTV website and services.",
    },
    html: TERMS_HTML,
  },
  {
    seoKey: "refund",
    id: "page-refund",
    name: "Refund Policy",
    slug: "/refund-policy/",
    adminParam: "refund-policy",
    seoTitle: "Refund Policy",
    seoDescription:
      "Flix IPTV refund rules, including the 7-day money-back guarantee for 1 Year subscription plans and above.",
    focusKeyword: "refund policy",
    hero: {
      eyebrow: "Legal",
      heading: "Refund Policy",
      highlight: "",
      description: "How refunds work, including which plans qualify for the 7-day money-back guarantee.",
    },
    html: REFUND_HTML,
  },
  {
    seoKey: "privacy",
    id: "page-privacy",
    name: "Privacy Policy",
    slug: "/privacy-policy/",
    adminParam: "privacy-policy",
    seoTitle: "Privacy Policy",
    seoDescription: "How Flix IPTV handles information you provide through the website, contact form, and support.",
    focusKeyword: "privacy policy",
    hero: {
      eyebrow: "Legal",
      heading: "Privacy Policy",
      highlight: "",
      description: "A practical summary of the information we collect and how we use it.",
    },
    html: PRIVACY_HTML,
  },
  {
    seoKey: "cookie",
    id: "page-cookie",
    name: "Cookie Policy",
    slug: "/cookie-policy/",
    adminParam: "cookie-policy",
    seoTitle: "Cookie Policy",
    seoDescription: "How cookies and similar technologies may be used on this Flix IPTV website.",
    focusKeyword: "cookie policy",
    hero: {
      eyebrow: "Legal",
      heading: "Cookie Policy",
      highlight: "",
      description: "What cookies are, which types may appear on this site, and how you can control them.",
    },
    html: COOKIE_HTML,
  },
  {
    seoKey: "copyright",
    id: "page-copyright",
    name: "Copyright Policy",
    slug: "/copyright-policy/",
    adminParam: "copyright-policy",
    seoTitle: "Copyright Policy",
    seoDescription: "How Flix IPTV treats website content, third-party rights, and copyright notices.",
    focusKeyword: "copyright policy",
    hero: {
      eyebrow: "Legal",
      heading: "Copyright Policy",
      highlight: "",
      description: "Respect for intellectual property and how rights holders can contact us.",
    },
    html: COPYRIGHT_HTML,
  },
  ];
}

export const DEFAULT_LEGAL_FOOTER_LINKS: NavLink[] = [
  nav("fl-terms", "Terms & Conditions", "/terms-and-conditions/"),
  nav("fl-refund", "Refund Policy", "/refund-policy/"),
  nav("fl-privacy", "Privacy Policy", "/privacy-policy/"),
  nav("fl-cookie", "Cookie Policy", "/cookie-policy/"),
  nav("fl-copyright", "Copyright Policy", "/copyright-policy/"),
];

export const DEFAULT_ABOUT_FOOTER_LINK: NavLink = nav("fq-about", "About Us", "/about-us/");

export function companyPageByAdminParam(param: string) {
  return COMPANY_PAGES.find((page) => page.adminParam === param);
}

export function companyPageBySlug(slug: string) {
  return COMPANY_PAGES.find((page) => page.slug === slug);
}

export function companyPageBySeoKey(key: CompanyPageSeoKey) {
  return COMPANY_PAGES.find((page) => page.seoKey === key);
}

export function companyPageSeoDefaults(): Record<CompanyPageSeoKey, PageSeo> {
  return Object.fromEntries(
    COMPANY_PAGES.map((page) => [
      page.seoKey,
      {
        ...defaultPageSeo(page.seoTitle, page.seoDescription, page.slug),
        focusKeyword: page.focusKeyword,
      },
    ]),
  ) as Record<CompanyPageSeoKey, PageSeo>;
}

function companySection(
  id: string,
  type: "page-hero" | "rich-content" | "messaging-cta",
  order: number,
  data: CmsSection["data"],
): CmsSection {
  const labels = {
    "page-hero": "Page Hero",
    "rich-content": "Rich Content / Long Description",
    "messaging-cta": "WhatsApp / Telegram CTA",
  } as const;
  return {
    id,
    type,
    label: labels[type],
    order,
    visible: true,
    data,
  };
}

export function createCompanyPageSections(page: CompanyPageDefinition): CmsSection[] {
  return [
    companySection(`sec-${page.seoKey}-hero`, "page-hero", 1, page.hero),
    companySection(`sec-${page.seoKey}-content`, "rich-content", 2, {
      eyebrow: "",
      heading: "",
      html: page.html,
      buttonLabel: "",
      buttonHref: "",
      width: "narrow",
      scrollable: false,
      scrollHeight: "standard",
      ctaSource: "custom",
    }),
    companySection(`sec-${page.seoKey}-cta`, "messaging-cta", 3, {
      heading: "Need help?",
      description:
        "For questions about your subscription, setup, or this page, message us on WhatsApp. You can also use the Contact page.",
      whatsappLabel: "Chat on WhatsApp",
      telegramLabel: "Open Telegram",
    }),
  ];
}

export function createCompanyCmsPages(): CmsPage[] {
  return COMPANY_PAGES.map((page) => ({
    id: page.id,
    name: page.name,
    slug: page.slug,
    status: "published" as const,
    cmsEnabled: true,
    sections: createCompanyPageSections(page),
  }));
}

export function mergeMissingCompanyPages(pages: CmsPage[]): { pages: CmsPage[]; changed: boolean } {
  const extras = createCompanyCmsPages();
  const slugs = new Set(pages.map((page) => page.slug));
  const missing = extras.filter((page) => !slugs.has(page.slug));
  if (!missing.length) return { pages, changed: false };
  return { pages: [...pages, ...missing], changed: true };
}

function hrefKey(href: string) {
  return href.replace(/\/+$/, "") || "/";
}

export function mergeMissingNavLinks(existing: NavLink[], required: NavLink[]): { links: NavLink[]; changed: boolean } {
  const seen = new Set(existing.map((item) => hrefKey(item.href)));
  const extra = required.filter((item) => !seen.has(hrefKey(item.href)));
  if (!extra.length) return { links: existing, changed: false };
  return { links: [...existing, ...extra], changed: true };
}

export function companyPageSeoMeta(): Record<
  CompanyPageSeoKey,
  { label: string; editorHref: string; publicPaths: string[] }
> {
  return Object.fromEntries(
    COMPANY_PAGES.map((page) => [
      page.seoKey,
      {
        label: page.name,
        editorHref: `/sidhu/pages/${page.adminParam}/`,
        publicPaths: [page.slug.replace(/\/$/, ""), page.slug],
      },
    ]),
  ) as Record<CompanyPageSeoKey, { label: string; editorHref: string; publicPaths: string[] }>;
}

const ABOUT_HTML = `<p>Flix IPTV is a UK-focused streaming subscription. The aim is simple: live TV, films and series on the devices you already use, with setup handled through a conversation rather than a long instruction pack.</p>
<p>People still search for IPTV. We describe the same practical need in plainer language: a streaming subscription for British households that want television on Firestick, Fire TV, Smart TV, Android TV, mobile, tablet or laptop, subject to the plan they choose.</p>
<h2>Who We Are</h2>
<p>We operate this website and the subscription service described on it. We do not publish a made-up company history, office tour, or customer count. What we can say is how the service works and how you can reach us.</p>
<p>If you are comparing streaming packages for a UK home, this page is an introduction. Plan details and prices are listed on the <a href="/iptv-subscriptions-uk/">IPTV Subscription</a> page.</p>
<h2>What We Offer</h2>
<p>Flix IPTV offers streaming packages for live television and on-demand entertainment. Compatibility, picture quality and the number of devices you can use depend on the plan you choose and the hardware you already own.</p>
<ul>
<li>Streaming on common living-room devices, including Firestick and Smart TV</li>
<li>Plan choices listed on the subscription page, without duplicating prices here</li>
<li>Setup and account help through WhatsApp</li>
<li>A refund process described on the <a href="/refund-policy/">Refund Policy</a> page</li>
</ul>
<p>We do not claim to be the number one provider in the United Kingdom. We do not invent channel counts, library sizes, or uptime promises that go stale.</p>
<h2>Our Approach to Support</h2>
<p>WhatsApp is the main way to get set up and to ask for help. We do not send login details or setup steps by email. When you are ready, message the team on WhatsApp. That is where payment instructions, account information and device questions are handled.</p>
<p>If WhatsApp is not available in a given moment, the <a href="/contact/">Contact</a> page lists the other ways published in Site Settings.</p>
<h2>Devices and Viewing</h2>
<p>Most customers already own the hardware. A Fire TV Stick is a common starting point in UK living rooms. Smart TVs, Android TV, phones, tablets and laptops may also be suitable, depending on your plan and the apps that work on that screen.</p>
<p>We do not sell hardware through this website. A “fully loaded” Firestick, in the way customers usually mean it, is about having the right apps ready on a stick you already have — not about posting a device in the mail.</p>
<h2>Contact Flix IPTV</h2>
<p>For subscriptions, payment details, setup and support, contact us on WhatsApp or use the Contact page. The details shown in the header, footer and contact areas come from the site’s central settings so they stay consistent.</p>`;

const TERMS_HTML = `<p>These terms govern use of this Flix IPTV website and services. They are a practical summary of how the site and subscriptions are meant to be used. They are not a substitute for independent legal advice, and they do not invent extra rights or company details that are not stated here.</p>
<h2>The website and the service</h2>
<p>The website explains Flix IPTV streaming packages, takes contact requests, and points you to WhatsApp for payment and setup. A subscription is a paid access period for streaming on compatible devices, as described when you choose a plan.</p>
<p>We may update website copy, plans, or these terms from time to time. The version published on this page is the current one.</p>
<h2>Accounts and subscriptions</h2>
<p>You are responsible for the contact details you give us and for keeping account information private. A subscription lasts for the billed period you choose. When that period ends, access ends unless you renew.</p>
<p>We may suspend or end a subscription if payment is not completed, if the account is used in a way that breaks these terms, or if we have to withdraw the service for operational reasons. If that happens, we will use the contact method you have been using with us, usually WhatsApp.</p>
<h2>Payments</h2>
<p>Payment instructions are sent manually through WhatsApp after you choose a plan. We do not publish live checkout on this website. Prices shown on the subscription page are the current listed packages unless we say otherwise.</p>
<p>You are responsible for paying with a method you are authorised to use. Activation follows payment confirmation, as explained during that WhatsApp conversation.</p>
<h2>Your responsibilities</h2>
<p>You must provide a stable internet connection and a compatible device. Picture quality and reliability depend on your network, your device, and the plan you selected. We cannot control your home broadband, Wi-Fi, or a third-party app store.</p>
<p>You must not share account details in a way that is not allowed on your plan, attempt to resell access, interfere with the service, or use the service for anything unlawful. You must not use the website or support channels to send abuse, malware, or misleading notices.</p>
<h2>Acceptable use</h2>
<p>The service is for personal household viewing on the devices and connections covered by your plan. Using the service to infringe other people’s rights, to attack our systems, or to mislead staff is not allowed.</p>
<h2>Support</h2>
<p>Support is provided through WhatsApp and the contact options published on the site. We aim to help with setup, device questions and plan changes. We do not promise an instant reply at every hour, even when support hours are described as flexible.</p>
<h2>Availability and changes</h2>
<p>Streaming services change. Apps, device support and available titles can vary. We may update packages, features, or this website without treating every change as a breach of these terms. If a change is material to a plan you already paid for, raise it through WhatsApp so we can look at your account.</p>
<h2>Refunds</h2>
<p>Refunds are described on the <a href="/refund-policy/">Refund Policy</a> page. That page is the detailed rule, including which plans qualify for the 7-day money-back guarantee.</p>
<h2>Limitation of wording</h2>
<p>The website and service are provided as described. We do not promise uninterrupted viewing, a fixed channel list, or that every title will remain available. To the extent the law allows, we are not responsible for losses caused by your internet connection, your device, or a third-party app.</p>
<h2>Contact</h2>
<p>Questions about these terms can be sent through WhatsApp or the <a href="/contact/">Contact</a> page. Use the published contact details on this website rather than addresses copied from elsewhere.</p>`;

const REFUND_HTML = `<p>This page explains how refunds work for Flix IPTV subscriptions. It is the detailed rule for money-back requests. Other pages may mention a guarantee in short form; this policy is where the limits are stated clearly.</p>
<h2>7-day money-back guarantee</h2>
<p>The 7-day money-back guarantee applies only to <strong>1 Year subscription plans and above</strong>. Shorter plans, including monthly and 3-month packages, are not automatically covered.</p>
<p>If you buy a qualifying 1 Year (or longer) plan and the service is not suitable, contact us on WhatsApp within 7 days of activation. We will review the request and, where the guarantee applies, arrange a refund through the same process used for your payment.</p>
<h2>Eligibility</h2>
<ul>
<li>The plan must be a 1 Year subscription or a longer billed period listed as such on the subscription page.</li>
<li>You must contact us within 7 days of activation.</li>
<li>The request should come from the WhatsApp conversation or contact details used for the order, so we can match the account.</li>
</ul>
<p>The guarantee is not a slogan for “forever, no questions, no time limit”. Seven days is seven days. It is not a trial that renews itself, and it is not a blanket promise for every package we sell.</p>
<h2>Plans that are not automatically covered</h2>
<p>1 Month, 3 Month, and any other plan shorter than 1 Year are not included in the automatic 7-day money-back guarantee. If something goes wrong on a shorter plan, still message us on WhatsApp. We can look at setup issues, but a refund is not guaranteed by this policy for those periods.</p>
<h2>How to request a refund</h2>
<ol>
<li>Open WhatsApp using the contact details published on this website.</li>
<li>Tell us you are asking about a refund and name the plan you paid for.</li>
<li>Give us the information we need to find the account, such as the payment reference or the device you set up.</li>
</ol>
<p>You can also start from the <a href="/contact/">Contact</a> page. We handle refund questions on WhatsApp whenever possible, because that is where payment and setup already take place.</p>
<h2>Payment and activation</h2>
<p>Activation follows payment confirmation. The 7-day window is counted from activation of a qualifying plan, not from the moment you first opened the website. If payment was not completed, there is nothing to refund under this policy.</p>
<h2>Reasonable limitations</h2>
<p>We may refuse a guarantee claim that is late, that is not for a qualifying 1 Year (or longer) plan, or that we cannot match to a real order. Repeated abuse of the guarantee, or a request that appears fraudulent, may also be declined.</p>
<p>Refunds, when approved, are processed through the payment method used for the order where that is practical. Timing depends on that method and is not instant in every case.</p>
<h2>Contact</h2>
<p>For refund questions, message us on WhatsApp or use the Contact page. Do not send payment card numbers in full through any form.</p>`;

const PRIVACY_HTML = `<p>This Privacy Policy describes, in practical terms, how Flix IPTV handles information you give us through the website and through support. It is not a claim of certification, and it does not list legal regimes we have not implemented.</p>
<h2>Information you provide</h2>
<p>You may send us a name, email address, phone number, and a message through the contact form. If you message us on WhatsApp, we receive the details you type there, including whatever is needed to set up or support an account.</p>
<p>Order and subscription conversations usually happen on WhatsApp. We use that information to match your request, send payment instructions, and help with setup. We do not ask you to paste full payment card numbers into the website form.</p>
<h2>Site usage</h2>
<p>Like most websites, our hosting environment may record technical data such as IP address, browser type, and pages requested. That information is used to operate and protect the site.</p>
<p>If analytics, advertising, or verification scripts are added through the site’s custom head code, those tools may collect usage data according to their own settings. We do not list product names here unless they are actually configured. See the <a href="/cookie-policy/">Cookie Policy</a> for cookies and similar technologies.</p>
<h2>Cookies</h2>
<p>The site may use cookies or similar storage that are needed for the website to function. Additional cookies may appear if scripts are added later. Details are on the Cookie Policy page.</p>
<h2>Service providers and hosting</h2>
<p>The website is hosted by a web host. Support may take place on WhatsApp or other messaging tools you choose to use. Those providers process data under their own terms. We use them to run the site and to talk to customers, not to build a public directory of your details.</p>
<h2>Security and retention</h2>
<p>We take ordinary care with information we hold, including access controls on the admin area. No website can promise perfect security.</p>
<p>We keep contact and account-related information for as long as it is needed to support the subscription, answer a request, or keep basic records of an order. We do not publish a fixed deletion timetable that we cannot stand behind.</p>
<h2>Your requests</h2>
<p>If you want to know what contact details we hold for you, or you want them updated, message us on WhatsApp or use the <a href="/contact/">Contact</a> page. We will use the conversation to confirm we are speaking to the right person.</p>
<p>We do not sell your contact form submissions as a mailing list. That is a statement of how we run this site, not a registered certification.</p>
<h2>Contact</h2>
<p>Privacy questions can be sent through the same published contact details as any other support request.</p>`;

const COOKIE_HTML = `<p>This Cookie Policy explains how cookies and similar technologies may be used on this Flix IPTV website. It does not invent a cookie-consent banner if the site does not show one, and it does not name analytics or advertising products that are not actually installed.</p>
<h2>What cookies are</h2>
<p>Cookies are small text files stored on your device when you visit a website. Similar technologies include local storage and pixels used by some scripts. They can remember a setting, keep a session working, or help a site understand how pages are used.</p>
<h2>Essential cookies</h2>
<p>Some cookies are needed for the website to operate. That can include keeping an admin session signed in on Sidhu, remembering basic site function, or supporting security. The public pages are meant to work without asking you to create an account.</p>
<h2>Analytics, advertising and verification</h2>
<p>The site includes a place for custom head code and SEO scripts. If the operator adds analytics, advertising, measurement, or domain-verification scripts there, those tools may set cookies or read usage data. We describe that possibility because the feature exists. We do not claim a specific analytics or ads vendor on this page.</p>
<h2>Preferences</h2>
<p>If a script or a future site feature stores a preference in your browser, that storage is used to remember a choice you made, not to replace the policies on this website.</p>
<h2>Third-party services</h2>
<p>Embedded or linked third-party services — for example WhatsApp, a font or media host, or a script added in head code — may set their own cookies. Those services have their own policies. We only control cookies that this website itself sets.</p>
<h2>Browser controls</h2>
<p>You can block or delete cookies in your browser settings. Blocking essential cookies may affect sign-in to the admin area or other site functions. There is no separate Flix IPTV cookie dashboard on this site unless one is added later.</p>
<h2>Updates</h2>
<p>We may update this policy if the way the site uses cookies changes. The published page is the current version. Related details are in the <a href="/privacy-policy/">Privacy Policy</a>.</p>`;

const COPYRIGHT_HTML = `<p>Flix IPTV respects intellectual property rights. This page explains how we treat the content of this website, how we think about third-party rights, and how a rights holder can send a notice. It does not claim that Flix IPTV owns third-party broadcasts, studios, publishers, or channel brands.</p>
<h2>Website content</h2>
<p>Flix IPTV branding, the logo files we publish, and the original text on this website are used to operate this site. You may not copy the site design or our original wording for another commercial streaming site without permission.</p>
<p>That statement is about this website’s own branding and copy. It is not a claim that Flix IPTV owns the copyright in television channels, films, series, sports events, or other third-party programmes that customers may watch through a subscription.</p>
<h2>Third-party rights</h2>
<p>Broadcast, studio and publisher rights belong to their owners. Flix IPTV does not state that all streamed material is our copyright, and we do not describe a licence we have not set out on this page.</p>
<p>Customers remain responsible for using the service and their devices lawfully. These policies do not authorise infringement.</p>
<h2>Reporting suspected infringement</h2>
<p>If you are a rights holder, or you act for one, and you believe material connected with this website infringes your rights, send a notice through WhatsApp or the <a href="/contact/">Contact</a> page. Please write “Copyright notice” so we can treat it as a rights request rather than a general support chat.</p>
<h2>What to include in a notice</h2>
<p>A useful notice usually includes:</p>
<ul>
<li>Your name and a working contact method</li>
<li>The work you say is protected, described clearly enough for us to identify it</li>
<li>Where you found the material (a page URL on this site, or a description of the account or listing)</li>
<li>A statement that you are the owner or are authorised to act</li>
<li>A statement that the information in the notice is accurate to the best of your knowledge</li>
</ul>
<p>We may ask for more detail if the notice is incomplete. We do not treat an anonymous or obviously false notice as a completed request.</p>
<h2>How we respond</h2>
<p>We review notices in good faith. Where we can identify the issue, we may remove or restrict material on this website, ask the customer for more information, or explain why we do not agree. We do not promise a fixed number of hours for every review.</p>
<p>Fraudulent, copied, or abusive notices waste time and may be ignored. Sending a notice does not, by itself, decide the outcome of a dispute between other people.</p>
<h2>Contact</h2>
<p>Use the published Flix IPTV contact details on this website. Do not send original master files or unrelated personal data unless we ask for something specific to identify the work.</p>`;

export const COMPANY_PAGES = buildCompanyPages();
