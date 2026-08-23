import Link from "next/link";
import { SiteShell } from "@/components/layout/SiteShell";

export default function NotFound() {
  return (
    <SiteShell>
      <section className="hero-grid flex min-h-[60vh] items-center pt-[76px]">
        <div className="mx-auto max-w-xl px-5 py-20 text-center">
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">404</p>
          <h1 className="mt-3 text-4xl font-extrabold text-white">Page not found</h1>
          <p className="mt-4 text-sm text-white/70">
            This local route does not exist yet. Try Home, Subscriptions, Blog, or Contact.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
