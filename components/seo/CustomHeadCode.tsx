import { parseHeadCode, type HeadCodeNode } from "@/lib/cms/head-code";

function mappedAttrs(attrs: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "charset") next.charSet = value;
    else if (key === "http-equiv") next.httpEquiv = value;
    else if (key === "crossorigin") next.crossOrigin = value;
    else if (key === "referrerpolicy") next.referrerPolicy = value;
    else next[key] = value;
  }
  return next;
}

function HeadNodeView({ node }: { node: HeadCodeNode }) {
  if (node.kind === "meta") {
    const attrs = mappedAttrs(node.attrs);
    return (
      <meta
        name={attrs.name || undefined}
        content={attrs.content || undefined}
        property={attrs.property || undefined}
        httpEquiv={attrs.httpEquiv || undefined}
        media={attrs.media || undefined}
        id={attrs.id || undefined}
      />
    );
  }
  if (node.kind === "link") {
    const attrs = mappedAttrs(node.attrs);
    return (
      <link
        rel={attrs.rel || undefined}
        href={attrs.href || undefined}
        type={attrs.type || undefined}
        sizes={attrs.sizes || undefined}
        media={attrs.media || undefined}
        as={attrs.as || undefined}
        integrity={attrs.integrity || undefined}
        id={attrs.id || undefined}
      />
    );
  }
  if (node.kind === "noscript") {
    return node.content ? <noscript dangerouslySetInnerHTML={{ __html: node.content }} /> : null;
  }
  if (node.kind !== "script") return null;
  const attrs = mappedAttrs(node.attrs);
  const hasFlag = (name: string) => attrs[name] !== undefined && attrs[name] !== "false";
  return (
    <script
      src={attrs.src || undefined}
      type={attrs.type || undefined}
      id={attrs.id || undefined}
      async={hasFlag("async") || undefined}
      defer={hasFlag("defer") || undefined}
      integrity={attrs.integrity || undefined}
      nonce={attrs.nonce || undefined}
      dangerouslySetInnerHTML={attrs.src ? undefined : { __html: node.content }}
    />
  );
}

export function CustomHeadCode({ html }: { html: string }) {
  const nodes = parseHeadCode(html || "");
  if (!nodes.length) return null;
  return (
    <>
      {nodes.map((node, index) => (
        <HeadNodeView key={`${node.kind}-${index}`} node={node} />
      ))}
    </>
  );
}
