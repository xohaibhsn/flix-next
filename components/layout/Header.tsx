"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo, type LogoBranding } from "@/components/layout/Logo";
import type { NavLink } from "@/lib/cms/types";

export function Header({
  overlay = false,
  branding,
  nav,
  ctaLabel,
  ctaHref,
}: {
  overlay?: boolean;
  branding?: LogoBranding;
  nav: NavLink[];
  ctaLabel: string;
  ctaHref: string;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const links = nav.filter((item) => item.visible);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const solid = !overlay || scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-ink/95 shadow-lg backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-5 lg:px-8">
        <Logo imageUrl={branding?.imageUrl} alt={branding?.alt} />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {links.map((item) => {
            const active =
              item.href === "/welcome/" || item.href === "/"
                ? pathname === "/welcome" || pathname === "/welcome/"
                : pathname.startsWith(item.href.replace(/\/$/, ""));
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`text-[13.5px] font-medium transition ${
                  active ? "text-white" : "text-white/80 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="hidden rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-hover lg:inline-flex"
          >
            {ctaLabel}
          </Link>
        ) : null}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
      {open ? (
        <div id="mobile-nav" className="border-t border-white/10 bg-ink px-5 pt-2 pb-6 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {links.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium text-white/85 hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white"
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
