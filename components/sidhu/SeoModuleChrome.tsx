import type { ReactNode } from "react";
import { ModuleSubNav } from "@/components/sidhu/ui/ModuleSubNav";
import { SIDHU_SEO_NAV } from "@/lib/cms/sidhu-seo-nav";

/** Server-safe SEO chrome: only serializable nav data crosses into ModuleSubNav. */
export function SeoModuleChrome({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <ModuleSubNav items={SIDHU_SEO_NAV} ariaLabel="SEO sections" />
      {children}
    </div>
  );
}
