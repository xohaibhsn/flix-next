import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Sidhu CMS",
};

export default function SidhuLayout({ children }: { children: ReactNode }) {
  return children;
}
