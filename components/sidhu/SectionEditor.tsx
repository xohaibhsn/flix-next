"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { createId } from "@/lib/cms/ids";
import type {
  CmsSection,
  ContactFormData,
  ContactInfoData,
  CtaData,
  DevicesData,
  FaqData,
  FaqItem,
  HeroData,
  HighlightsData,
  HowItWorksData,
  InfoCardsData,
  MediaAsset,
  MessagingCtaData,
  PageHeroData,
  PricingData,
  RichContentData,
  RichTextData,
  ServicesData,
  TrustStatsData,
  WhyChooseData,
} from "@/lib/cms/types";
import { FAQ_CATEGORIES } from "@/lib/cms/faq-categories";
import { Field, IconSelect, RowActions, TextArea, TextInput } from "@/components/sidhu/fields";
import { MediaSpecHint } from "@/components/sidhu/ImageField";
import { MediaPickerModal } from "@/components/sidhu/MediaPickerModal";
import { ClientRichTextEditor } from "@/components/sidhu/ClientRichTextEditor";
import { insertEditorImage } from "@/lib/cms/blog";

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function SectionEditor({
  section,
  onChange,
  faqs = [],
  assets = [],
}: {
  section: CmsSection;
  onChange: (section: CmsSection) => void;
  faqs?: FaqItem[];
  assets?: MediaAsset[];
}) {
  const setData = (data: CmsSection["data"]) => onChange({ ...section, data });

  switch (section.type) {
    case "hero":
      return <HeroFields data={section.data as HeroData} onChange={setData} />;
    case "highlights":
      return (
        <IconLabelList
          items={Array.isArray((section.data as HighlightsData).items) ? (section.data as HighlightsData).items : []}
          onChange={(items) => setData({ ...(section.data as HighlightsData), items })}
          withSubtitle
        />
      );
    case "how-it-works":
      return <HowItWorksFields data={section.data as HowItWorksData} onChange={setData} />;
    case "services":
      return <ServicesFields data={section.data as ServicesData} onChange={setData} />;
    case "pricing":
      return <PricingFields data={section.data as PricingData} onChange={setData} />;
    case "devices":
      return (
        <div className="space-y-4">
          <HeaderFields data={section.data as DevicesData} onChange={setData} withDescription={false} />
          <IconLabelList
            items={Array.isArray((section.data as DevicesData).items) ? (section.data as DevicesData).items : []}
            onChange={(items) => setData({ ...(section.data as DevicesData), items })}
          />
        </div>
      );
    case "trust-stats":
      return <TrustFields data={section.data as TrustStatsData} onChange={setData} />;
    case "why-choose":
      return <WhyFields data={section.data as WhyChooseData} onChange={setData} />;
    case "faq":
      return <FaqFields data={section.data as FaqData} faqs={faqs} onChange={setData} />;
    case "cta":
      return <CtaFields data={section.data as CtaData} onChange={setData} />;
    case "page-hero":
      return <PageHeroFields data={section.data as PageHeroData} onChange={setData} />;
    case "rich-text":
      return <RichTextFields data={section.data as RichTextData} onChange={setData} />;
    case "rich-content":
      return <RichContentFields data={section.data as RichContentData} assets={assets} onChange={setData} />;
    case "info-cards":
      return <InfoCardFields data={section.data as InfoCardsData} onChange={setData} />;
    case "contact-info":
    case "hours":
      return <HeaderFields data={section.data as ContactInfoData} onChange={setData} />;
    case "contact-form":
      return <ContactFormFields data={section.data as ContactFormData} onChange={setData} />;
    case "messaging-cta":
      return <MessagingFields data={section.data as MessagingCtaData} onChange={setData} />;
    default:
      return <p className="text-sm text-muted">This section type cannot be edited yet.</p>;
  }
}

function HeaderFields({
  data,
  onChange,
  withDescription = true,
}: {
  data: { eyebrow?: string; heading: string; description?: string };
  onChange: (data: never) => void;
  withDescription?: boolean;
}) {
  return (
    <>
      <Field label="Eyebrow">
        <TextInput
          value={data.eyebrow ?? ""}
          onChange={(event) => onChange({ ...data, eyebrow: event.target.value } as never)}
        />
      </Field>
      <Field label="Heading">
        <TextInput
          value={data.heading}
          onChange={(event) => onChange({ ...data, heading: event.target.value } as never)}
        />
      </Field>
      {withDescription ? (
        <Field label="Description">
          <TextArea
            value={data.description ?? ""}
            onChange={(event) => onChange({ ...data, description: event.target.value } as never)}
          />
        </Field>
      ) : null}
    </>
  );
}

function IconLabelList({
  items,
  onChange,
  withSubtitle = false,
}: {
  items: Array<{ id: string; icon: string; label: string; subtitle?: string }>;
  onChange: (items: Array<{ id: string; icon: string; label: string; subtitle?: string }>) => void;
  withSubtitle?: boolean;
}) {
  return (
    <div className="space-y-3">
      <AddButton
        onClick={() => onChange([...items, { id: createId("item"), icon: "Tv", label: "New item", subtitle: "" }])}
      />
      {items.map((item, index) => (
        <Box
          key={item.id}
          onUp={() => onChange(move(items, index, -1))}
          onDown={() => onChange(move(items, index, 1))}
          onRemove={() => onChange(items.filter((row) => row.id !== item.id))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Icon">
              <IconSelect
                value={item.icon}
                onChange={(icon) => onChange(items.map((row) => (row.id === item.id ? { ...row, icon } : row)))}
              />
            </Field>
            <Field label="Label">
              <TextInput
                value={item.label}
                onChange={(event) =>
                  onChange(items.map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)))
                }
              />
            </Field>
          </div>
          {withSubtitle ? (
            <Field label="Subtitle">
              <TextInput
                value={item.subtitle ?? ""}
                onChange={(event) =>
                  onChange(
                    items.map((row) => (row.id === item.id ? { ...row, subtitle: event.target.value } : row)),
                  )
                }
              />
            </Field>
          ) : null}
        </Box>
      ))}
    </div>
  );
}

function HeroFields({ data, onChange }: { data: HeroData; onChange: (data: HeroData) => void }) {
  const trustItems = Array.isArray(data.trustItems) ? data.trustItems : [];
  const posters = Array.isArray(data.posters) ? data.posters : [];
  return (
    <div className="space-y-4">
      <Field label="Badge text">
        <TextInput value={data.badge} onChange={(event) => onChange({ ...data, badge: event.target.value })} />
      </Field>
      <Field
        label="Heading"
        hint="This is the Home Hero H1 on /welcome/. It is not the Site Settings tagline."
      >
        <TextInput value={data.heading} onChange={(event) => onChange({ ...data, heading: event.target.value })} />
      </Field>
      <Field label="Highlighted heading text" hint="Second line of the Hero H1, shown in brand color.">
        <TextInput value={data.highlight} onChange={(event) => onChange({ ...data, highlight: event.target.value })} />
      </Field>
      <Field label="Description">
        <TextArea value={data.description} onChange={(event) => onChange({ ...data, description: event.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary button label">
          <TextInput value={data.primaryLabel} onChange={(event) => onChange({ ...data, primaryLabel: event.target.value })} />
        </Field>
        <Field label="Primary button URL">
          <TextInput value={data.primaryHref} onChange={(event) => onChange({ ...data, primaryHref: event.target.value })} />
        </Field>
        <Field label="Secondary button label">
          <TextInput value={data.secondaryLabel} onChange={(event) => onChange({ ...data, secondaryLabel: event.target.value })} />
        </Field>
        <Field label="Secondary button URL">
          <TextInput value={data.secondaryHref} onChange={(event) => onChange({ ...data, secondaryHref: event.target.value })} />
        </Field>
        <Field label="Showcase brand">
          <TextInput value={data.showcaseBrand} onChange={(event) => onChange({ ...data, showcaseBrand: event.target.value })} />
        </Field>
        <Field label="Showcase eyebrow">
          <TextInput value={data.showcaseEyebrow} onChange={(event) => onChange({ ...data, showcaseEyebrow: event.target.value })} />
        </Field>
        <Field label="Showcase title">
          <TextInput value={data.showcaseTitle} onChange={(event) => onChange({ ...data, showcaseTitle: event.target.value })} />
        </Field>
        <Field label="Showcase meta">
          <TextInput value={data.showcaseMeta} onChange={(event) => onChange({ ...data, showcaseMeta: event.target.value })} />
        </Field>
      </div>
      <Field label="Showcase row label">
        <TextInput value={data.showcaseRowLabel} onChange={(event) => onChange({ ...data, showcaseRowLabel: event.target.value })} />
      </Field>
      <IconLabelList
        items={trustItems}
        onChange={(items) => onChange({ ...data, trustItems: items })}
      />
      <div>
        <AddButton
          label="+ Add poster"
          onClick={() => onChange({ ...data, posters: [...posters, { id: createId("poster"), title: "New title" }] })}
        />
        <div className="mt-3 space-y-3">
          {posters.map((poster, index) => (
            <div key={poster.id} className="flex items-center gap-3">
              <TextInput
                value={poster.title}
                onChange={(event) =>
                  onChange({
                    ...data,
                    posters: posters.map((row) =>
                      row.id === poster.id ? { ...row, title: event.target.value } : row,
                    ),
                  })
                }
              />
              <RowActions
                onUp={() => onChange({ ...data, posters: move(posters, index, -1) })}
                onDown={() => onChange({ ...data, posters: move(posters, index, 1) })}
                onRemove={() =>
                  onChange({ ...data, posters: posters.filter((row) => row.id !== poster.id) })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HowItWorksFields({
  data,
  onChange,
}: {
  data: HowItWorksData;
  onChange: (data: HowItWorksData) => void;
}) {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <AddButton
        label="+ Add step"
        onClick={() =>
          onChange({
            ...data,
            steps: [
              ...steps,
              {
                id: createId("step"),
                number: String(steps.length + 1),
                icon: "Play",
                title: "New step",
                description: "",
              },
            ],
          })
        }
      />
      {steps.map((step, index) => (
        <Box
          key={step.id}
          onUp={() => onChange({ ...data, steps: move(steps, index, -1) })}
          onDown={() => onChange({ ...data, steps: move(steps, index, 1) })}
          onRemove={() => onChange({ ...data, steps: steps.filter((row) => row.id !== step.id) })}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Step number">
              <TextInput
                value={step.number}
                onChange={(event) =>
                  onChange({
                    ...data,
                    steps: steps.map((row) => (row.id === step.id ? { ...row, number: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Icon">
              <IconSelect
                value={step.icon}
                onChange={(icon) =>
                  onChange({
                    ...data,
                    steps: steps.map((row) => (row.id === step.id ? { ...row, icon } : row)),
                  })
                }
              />
            </Field>
            <Field label="Title">
              <TextInput
                value={step.title}
                onChange={(event) =>
                  onChange({
                    ...data,
                    steps: steps.map((row) => (row.id === step.id ? { ...row, title: event.target.value } : row)),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              value={step.description}
              onChange={(event) =>
                onChange({
                  ...data,
                  steps: steps.map((row) =>
                    row.id === step.id ? { ...row, description: event.target.value } : row,
                  ),
                })
              }
            />
          </Field>
        </Box>
      ))}
    </div>
  );
}

function ServicesFields({
  data,
  onChange,
}: {
  data: ServicesData;
  onChange: (data: ServicesData) => void;
}) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <AddButton
        label="+ Add card"
        onClick={() =>
          onChange({
            ...data,
            cards: [
              ...cards,
              {
                id: createId("card"),
                icon: "Tv",
                title: "New service",
                description: "",
                linkLabel: "Explore",
                linkHref: "/",
                tone: "red",
              },
            ],
          })
        }
      />
      {cards.map((card, index) => (
        <Box
          key={card.id}
          onUp={() => onChange({ ...data, cards: move(cards, index, -1) })}
          onDown={() => onChange({ ...data, cards: move(cards, index, 1) })}
          onRemove={() => onChange({ ...data, cards: cards.filter((row) => row.id !== card.id) })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Icon">
              <IconSelect
                value={card.icon}
                onChange={(icon) =>
                  onChange({ ...data, cards: cards.map((row) => (row.id === card.id ? { ...row, icon } : row)) })
                }
              />
            </Field>
            <Field label="Visual tone">
              <select
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                value={card.tone}
                onChange={(event) =>
                  onChange({
                    ...data,
                    cards: cards.map((row) =>
                      row.id === card.id
                        ? { ...row, tone: event.target.value as ServicesData["cards"][number]["tone"] }
                        : row,
                    ),
                  })
                }
              >
                <option value="red">Red</option>
                <option value="purple">Purple</option>
                <option value="green">Green</option>
              </select>
            </Field>
            <Field label="Title">
              <TextInput
                value={card.title}
                onChange={(event) =>
                  onChange({
                    ...data,
                    cards: cards.map((row) => (row.id === card.id ? { ...row, title: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Link label">
              <TextInput
                value={card.linkLabel}
                onChange={(event) =>
                  onChange({
                    ...data,
                    cards: cards.map((row) =>
                      row.id === card.id ? { ...row, linkLabel: event.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              value={card.description}
              onChange={(event) =>
                onChange({
                  ...data,
                  cards: cards.map((row) =>
                    row.id === card.id ? { ...row, description: event.target.value } : row,
                  ),
                })
              }
            />
          </Field>
          <Field label="Link URL">
            <TextInput
              value={card.linkHref}
              onChange={(event) =>
                onChange({
                  ...data,
                  cards: cards.map((row) => (row.id === card.id ? { ...row, linkHref: event.target.value } : row)),
                })
              }
            />
          </Field>
        </Box>
      ))}
    </div>
  );
}

function PricingFields({ data, onChange }: { data: PricingData; onChange: (data: PricingData) => void }) {
  const plans = Array.isArray(data.plans) ? data.plans : [];
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(data.useCentralPlans)}
          onChange={(event) => onChange({ ...data, useCentralPlans: event.target.checked })}
        />
        Use central pricing plans
      </label>
      {data.useCentralPlans ? (
        <p className="text-xs text-muted">Plans are managed under Sidhu → Pricing. This section still uses the heading above.</p>
      ) : (
        <>
      <AddButton
        label="+ Add plan"
        onClick={() =>
          onChange({
            ...data,
            plans: [
              ...plans,
              {
                id: createId("plan"),
                name: "New plan",
                price: "0.00",
                duration: "/ month",
                badge: "",
                popular: false,
                features: ["Feature"],
                buttonLabel: "Choose Plan",
                buttonHref: "/contact/",
              },
            ],
          })
        }
      />
      {plans.map((plan, index) => (
        <Box
          key={plan.id}
          onUp={() => onChange({ ...data, plans: move(plans, index, -1) })}
          onDown={() => onChange({ ...data, plans: move(plans, index, 1) })}
          onRemove={() => onChange({ ...data, plans: plans.filter((row) => row.id !== plan.id) })}
        >
          <button
            type="button"
            className="text-xs font-semibold text-brand"
            onClick={() =>
              onChange({
                ...data,
                plans: [
                  ...plans.slice(0, index + 1),
                  { ...plan, id: createId("plan"), name: `${plan.name} copy`, popular: false },
                  ...plans.slice(index + 1),
                ],
              })
            }
          >
            Duplicate plan
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan name">
              <TextInput
                value={plan.name}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) => (row.id === plan.id ? { ...row, name: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Price">
              <TextInput
                value={plan.price}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) => (row.id === plan.id ? { ...row, price: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Duration">
              <TextInput
                value={plan.duration}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) =>
                      row.id === plan.id ? { ...row, duration: event.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Badge text">
              <TextInput
                value={plan.badge}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) => (row.id === plan.id ? { ...row, badge: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Button label">
              <TextInput
                value={plan.buttonLabel}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) =>
                      row.id === plan.id ? { ...row, buttonLabel: event.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Button URL">
              <TextInput
                value={plan.buttonHref}
                onChange={(event) =>
                  onChange({
                    ...data,
                    plans: plans.map((row) =>
                      row.id === plan.id ? { ...row, buttonHref: event.target.value } : row,
                    ),
                  })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={plan.popular}
              onChange={(event) =>
                onChange({
                  ...data,
                  plans: plans.map((row) =>
                    row.id === plan.id ? { ...row, popular: event.target.checked } : row,
                  ),
                })
              }
            />
            Popular plan
          </label>
          <Field label="Features" hint="One feature per line">
            <TextArea
              value={plan.features.join("\n")}
              onChange={(event) =>
                onChange({
                  ...data,
                  plans: plans.map((row) =>
                    row.id === plan.id
                      ? {
                          ...row,
                          features: event.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        }
                      : row,
                  ),
                })
              }
            />
          </Field>
        </Box>
      ))}
        </>
      )}
    </div>
  );
}

function TrustFields({ data, onChange }: { data: TrustStatsData; onChange: (data: TrustStatsData) => void }) {
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="space-y-3">
      <AddButton
        label="+ Add stat"
        onClick={() =>
          onChange({ items: [...items, { id: createId("stat"), icon: "Tv", value: "0", label: "New stat" }] })
        }
      />
      {items.map((item, index) => (
        <Box
          key={item.id}
          onUp={() => onChange({ items: move(items, index, -1) })}
          onDown={() => onChange({ items: move(items, index, 1) })}
          onRemove={() => onChange({ items: items.filter((row) => row.id !== item.id) })}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Icon">
              <IconSelect
                value={item.icon}
                onChange={(icon) =>
                  onChange({ items: items.map((row) => (row.id === item.id ? { ...row, icon } : row)) })
                }
              />
            </Field>
            <Field label="Value">
              <TextInput
                value={item.value}
                onChange={(event) =>
                  onChange({
                    items: items.map((row) => (row.id === item.id ? { ...row, value: event.target.value } : row)),
                  })
                }
              />
            </Field>
            <Field label="Label">
              <TextInput
                value={item.label}
                onChange={(event) =>
                  onChange({
                    items: items.map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)),
                  })
                }
              />
            </Field>
          </div>
        </Box>
      ))}
    </div>
  );
}

function WhyFields({ data, onChange }: { data: WhyChooseData; onChange: (data: WhyChooseData) => void }) {
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <AddButton
        label="+ Add item"
        onClick={() =>
          onChange({
            ...data,
            items: [...items, { id: createId("why"), icon: "ShieldCheck", title: "New reason", description: "" }],
          })
        }
      />
      {items.map((item, index) => (
        <Box
          key={item.id}
          onUp={() => onChange({ ...data, items: move(items, index, -1) })}
          onDown={() => onChange({ ...data, items: move(items, index, 1) })}
          onRemove={() => onChange({ ...data, items: items.filter((row) => row.id !== item.id) })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Icon">
              <IconSelect
                value={item.icon}
                onChange={(icon) =>
                  onChange({
                    ...data,
                    items: items.map((row) => (row.id === item.id ? { ...row, icon } : row)),
                  })
                }
              />
            </Field>
            <Field label="Title">
              <TextInput
                value={item.title}
                onChange={(event) =>
                  onChange({
                    ...data,
                    items: items.map((row) => (row.id === item.id ? { ...row, title: event.target.value } : row)),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              value={item.description}
              onChange={(event) =>
                onChange({
                  ...data,
                  items: items.map((row) =>
                    row.id === item.id ? { ...row, description: event.target.value } : row,
                  ),
                })
              }
            />
          </Field>
        </Box>
      ))}
    </div>
  );
}

function FaqFields({
  data,
  faqs,
  onChange,
}: {
  data: FaqData;
  faqs: FaqItem[];
  onChange: (data: FaqData) => void;
}) {
  const sourceMode = data.sourceMode === "selected" ? "selected" : "category";
  const selectedFaqIds = Array.isArray(data.selectedFaqIds) ? data.selectedFaqIds : [];
  const visibleFaqs = faqs.filter((item) => item.visible);

  function moveSelected(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= selectedFaqIds.length) return;
    const copy = [...selectedFaqIds];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange({ ...data, selectedFaqIds: copy, sourceMode: "selected" });
  }

  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <Field label="FAQ Source">
        <select
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          value={sourceMode}
          onChange={(event) =>
            onChange({
              ...data,
              sourceMode: event.target.value === "selected" ? "selected" : "category",
              useCentralFaqs: true,
            })
          }
        >
          <option value="category">Category</option>
          <option value="selected">Select FAQs manually</option>
        </select>
      </Field>
      <Field label="Maximum FAQs" hint="0 = show all matching FAQs.">
        <TextInput
          type="number"
          min={0}
          max={50}
          value={String(data.maxItems || 0)}
          onChange={(event) => onChange({ ...data, maxItems: Number(event.target.value) || 0 })}
        />
      </Field>
      {sourceMode === "category" ? (
        <Field label="FAQ category">
          <select
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            value={data.category}
            onChange={(event) => onChange({ ...data, category: event.target.value, sourceMode: "category", useCentralFaqs: true })}
          >
            <option value="">All categories</option>
            {FAQ_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">Choose central FAQs. Order on this page is independent of the FAQ manager.</p>
          {selectedFaqIds.map((id, index) => {
            const item = visibleFaqs.find((row) => row.id === id) || faqs.find((row) => row.id === id);
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
                <p className="text-sm">{item?.question || "FAQ removed from library"}</p>
                <div className="flex gap-1">
                  <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => moveSelected(index, -1)}>
                    Up
                  </button>
                  <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => moveSelected(index, 1)}>
                    Down
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                    onClick={() => onChange({ ...data, selectedFaqIds: selectedFaqIds.filter((row) => row !== id) })}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <Field label="Add FAQ">
            <select
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (!id || selectedFaqIds.includes(id)) return;
                onChange({ ...data, selectedFaqIds: [...selectedFaqIds, id], sourceMode: "selected" });
              }}
            >
              <option value="">Select a question…</option>
              {visibleFaqs
                .filter((item) => !selectedFaqIds.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.question}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

function CtaFields({ data, onChange }: { data: CtaData; onChange: (data: CtaData) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Heading">
        <TextInput value={data.heading} onChange={(event) => onChange({ ...data, heading: event.target.value })} />
      </Field>
      <Field label="Description">
        <TextArea value={data.description} onChange={(event) => onChange({ ...data, description: event.target.value })} />
      </Field>
      <Field label="Button label">
        <TextInput value={data.buttonLabel} onChange={(event) => onChange({ ...data, buttonLabel: event.target.value })} />
      </Field>
      <Field label="Button URL">
        <TextInput value={data.buttonHref} onChange={(event) => onChange({ ...data, buttonHref: event.target.value })} />
      </Field>
    </div>
  );
}

function PageHeroFields({ data, onChange }: { data: PageHeroData; onChange: (data: PageHeroData) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Eyebrow">
        <TextInput value={data.eyebrow} onChange={(event) => onChange({ ...data, eyebrow: event.target.value })} />
      </Field>
      <Field label="Heading">
        <TextInput value={data.heading} onChange={(event) => onChange({ ...data, heading: event.target.value })} />
      </Field>
      <Field label="Highlight">
        <TextInput value={data.highlight} onChange={(event) => onChange({ ...data, highlight: event.target.value })} />
      </Field>
      <Field label="Description">
        <TextArea value={data.description} onChange={(event) => onChange({ ...data, description: event.target.value })} />
      </Field>
    </div>
  );
}

function RichTextFields({ data, onChange }: { data: RichTextData; onChange: (data: RichTextData) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Heading">
        <TextInput value={data.heading} onChange={(event) => onChange({ ...data, heading: event.target.value })} />
      </Field>
      <Field label="HTML content" hint="Keep this simple. Scripts are stripped on save.">
        <TextArea value={data.html} onChange={(event) => onChange({ ...data, html: event.target.value })} />
      </Field>
    </div>
  );
}

function RichContentFields({
  data,
  assets,
  onChange,
}: {
  data: RichContentData;
  assets: MediaAsset[];
  onChange: (data: RichContentData) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Eyebrow / small label">
        <TextInput value={data.eyebrow} onChange={(event) => onChange({ ...data, eyebrow: event.target.value })} />
      </Field>
      <Field label="Main heading">
        <TextInput value={data.heading} onChange={(event) => onChange({ ...data, heading: event.target.value })} />
      </Field>
      <Field label="Content width">
        <select
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          value={data.width || "narrow"}
          onChange={(event) =>
            onChange({
              ...data,
              width: event.target.value === "wide" || event.target.value === "normal" ? event.target.value : "narrow",
            })
          }
        >
          <option value="narrow">Narrow reading width</option>
          <option value="normal">Normal</option>
          <option value="wide">Wide</option>
        </select>
      </Field>
      <label className="block text-sm">
        <input
          type="checkbox"
          checked={Boolean(data.scrollable)}
          onChange={(event) => onChange({ ...data, scrollable: event.target.checked })}
        />{" "}
        Scrollable Content
      </label>
      {data.scrollable ? (
        <Field label="Scroll height">
          <select
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
            value={data.scrollHeight || "standard"}
            onChange={(event) =>
              onChange({
                ...data,
                scrollHeight:
                  event.target.value === "compact" || event.target.value === "tall" ? event.target.value : "standard",
              })
            }
          >
            <option value="compact">Compact</option>
            <option value="standard">Standard</option>
            <option value="tall">Tall</option>
          </select>
        </Field>
      ) : null}
      <Field label="Body content">
        <RichContentEditor data={data} assets={assets} onChange={onChange} />
      </Field>
      <Field label="Optional CTA label">
        <TextInput value={data.buttonLabel} onChange={(event) => onChange({ ...data, buttonLabel: event.target.value })} />
      </Field>
      <Field label="CTA destination">
        <select
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
          value={data.ctaSource === "whatsapp" ? "whatsapp" : "custom"}
          onChange={(event) =>
            onChange({
              ...data,
              ctaSource: event.target.value === "whatsapp" ? "whatsapp" : "custom",
            })
          }
        >
          <option value="whatsapp">Global WhatsApp</option>
          <option value="custom">Custom URL</option>
        </select>
      </Field>
      {data.ctaSource === "whatsapp" ? (
        <p className="text-xs text-muted">Uses the WhatsApp number and message from Site Settings. No phone number is stored in this section.</p>
      ) : (
        <Field label="Optional CTA URL">
          <TextInput value={data.buttonHref} onChange={(event) => onChange({ ...data, buttonHref: event.target.value })} />
        </Field>
      )}
    </div>
  );
}

function RichContentEditor({
  data,
  assets,
  onChange,
}: {
  data: RichContentData;
  assets: MediaAsset[];
  onChange: (data: RichContentData) => void;
}) {
  const [picker, setPicker] = useState(false);
  return (
    <>
      <MediaSpecHint specId="blogContent" />
      <div className="mt-2">
        <ClientRichTextEditor
          value={data.html}
          onChange={(html) => onChange({ ...data, html })}
          onRequestImage={() => setPicker(true)}
          placeholder="Write the long description…"
        />
      </div>
      {picker ? (
        <MediaPickerModal
          title="Insert image"
          assets={assets}
          onClose={() => setPicker(false)}
          onSelect={(asset) => {
            onChange({
              ...data,
              html: insertEditorImage(data.html, asset.secureUrl, asset.alt || data.heading || ""),
            });
            setPicker(false);
          }}
        />
      ) : null}
    </>
  );
}

function InfoCardFields({ data, onChange }: { data: InfoCardsData; onChange: (data: InfoCardsData) => void }) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <AddButton
        label="+ Add card"
        onClick={() =>
          onChange({
            ...data,
            cards: [...cards, { id: createId("card"), icon: "Check", title: "New card", description: "" }],
          })
        }
      />
      {cards.map((card, index) => (
        <Box
          key={card.id}
          onUp={() => onChange({ ...data, cards: move(cards, index, -1) })}
          onDown={() => onChange({ ...data, cards: move(cards, index, 1) })}
          onRemove={() => onChange({ ...data, cards: cards.filter((row) => row.id !== card.id) })}
        >
          <Field label="Title">
            <TextInput
              value={card.title}
              onChange={(event) =>
                onChange({
                  ...data,
                  cards: cards.map((row) => (row.id === card.id ? { ...row, title: event.target.value } : row)),
                })
              }
            />
          </Field>
          <Field label="Description">
            <TextArea
              value={card.description}
              onChange={(event) =>
                onChange({
                  ...data,
                  cards: cards.map((row) =>
                    row.id === card.id ? { ...row, description: event.target.value } : row,
                  ),
                })
              }
            />
          </Field>
        </Box>
      ))}
    </div>
  );
}

function ContactFormFields({ data, onChange }: { data: ContactFormData; onChange: (data: ContactFormData) => void }) {
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      {(["nameLabel", "emailLabel", "phoneLabel", "subjectLabel", "messageLabel", "buttonLabel", "successMessage"] as const).map(
        (key) => (
          <Field key={key} label={key}>
            <TextInput value={data[key]} onChange={(event) => onChange({ ...data, [key]: event.target.value })} />
          </Field>
        ),
      )}
    </div>
  );
}

function MessagingFields({ data, onChange }: { data: MessagingCtaData; onChange: (data: MessagingCtaData) => void }) {
  return (
    <div className="space-y-4">
      <HeaderFields data={data} onChange={onChange as never} />
      <Field label="WhatsApp button">
        <TextInput value={data.whatsappLabel} onChange={(event) => onChange({ ...data, whatsappLabel: event.target.value })} />
      </Field>
      <Field label="Telegram button">
        <TextInput value={data.telegramLabel} onChange={(event) => onChange({ ...data, telegramLabel: event.target.value })} />
      </Field>
    </div>
  );
}

function AddButton({ onClick, label = "+ Add item" }: { onClick: () => void; label?: string }) {
  return (
    <div className="flex justify-end">
      <button type="button" className="text-xs font-semibold text-brand" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

function Box({
  children,
  onUp,
  onDown,
  onRemove,
}: {
  children: ReactNode;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex justify-end">
        <RowActions onUp={onUp} onDown={onDown} onRemove={onRemove} />
      </div>
      {children}
    </div>
  );
}
