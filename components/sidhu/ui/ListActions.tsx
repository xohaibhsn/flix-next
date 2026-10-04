import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/sidhu/ui/cn";

const base =
  "inline-flex min-h-9 items-center justify-center rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50";

const variants = {
  primary: "border-transparent bg-transparent text-brand hover:bg-paper",
  secondary: "border-line bg-admin-surface text-ink hover:bg-paper",
  danger: "border-red-200 bg-admin-surface text-red-700 hover:bg-red-50",
} as const;

export function ListActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

export function ListActionButton({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return <button type={type} className={cn(base, variants[variant], className)} {...props} />;
}

export function ListActionLink({
  href,
  children,
  variant = "primary",
  className,
  target,
  rel,
  title,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
  target?: string;
  rel?: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], className)}
      target={target}
      rel={rel}
      title={title}
    >
      {children}
    </Link>
  );
}
