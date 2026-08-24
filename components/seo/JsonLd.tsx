import { serializeJsonLdScript } from "@/lib/cms/json-ld-input";

export function JsonLd({ data }: { data: object | object[] | null }) {
  if (!data) return null;
  if (Array.isArray(data) && data.length === 0) return null;
  if (!Array.isArray(data) && Object.keys(data).length === 0) return null;
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLdScript(data) }} />
  );
}
