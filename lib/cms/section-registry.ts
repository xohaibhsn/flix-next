import type { SectionType } from "@/lib/cms/types";
import { SECTION_LABELS } from "@/lib/cms/defaults";

export const SUPPORTED_SECTION_TYPES: { type: SectionType; label: string }[] =
  (Object.keys(SECTION_LABELS) as SectionType[]).map((type) => ({
    type,
    label: SECTION_LABELS[type],
  }));
