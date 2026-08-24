import type { ReactNode } from "react";
import Link from "next/link";
import { externalAnchorProps, isExternalHref } from "@/lib/cms/contact";

const variants = {
  primary:
    "bg-brand text-white shadow-lg shadow-brand/30 hover:bg-brand-hover",
  outline:
    "border-2 border-brand text-brand hover:bg-red-50",
  ghost:
    "border border-white/25 text-white hover:border-white/50 hover:bg-white/5",
};

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
  "aria-label"?: string;
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
  "aria-label": ariaLabel,
}: ButtonLinkProps) {
  const classNames = `inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition ${variants[variant]} ${className}`;
  if (isExternalHref(href)) {
    return (
      <a href={href} className={classNames} aria-label={ariaLabel} {...externalAnchorProps(href)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classNames} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
