import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/sidhu/ui/cn";

export type SidhuButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT: Record<SidhuButtonVariant, string> = {
  primary:
    "border-transparent bg-brand text-white hover:bg-brand-hover disabled:bg-brand/60",
  secondary:
    "border-line bg-admin-surface text-ink hover:bg-paper disabled:text-muted",
  danger:
    "border-red-200 bg-admin-surface text-red-700 hover:bg-red-50 disabled:text-red-300",
  ghost: "border-transparent bg-transparent text-muted hover:bg-paper hover:text-ink",
};

export const sidhuButtonClass = (
  variant: SidhuButtonVariant = "secondary",
  className?: string,
) =>
  cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-admin-canvas",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT[variant],
    className,
  );

export function Button({
  variant = "secondary",
  className,
  children,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: SidhuButtonVariant;
  children: ReactNode;
}) {
  return (
    <button type={type} className={sidhuButtonClass(variant, className)} {...props}>
      {children}
    </button>
  );
}
