import type { RedirectRule, RedirectStatus } from "@/lib/cms/types";

export const MANAGED_REDIRECT_SEED_KEY = "managed_redirects_v1";

export type ManagedRedirectSeed = {
  id: string;
  sourcePath: string;
  destinationPath: string;
  statusCode: RedirectStatus;
  active: boolean;
};

export const MANAGED_REDIRECTS: ManagedRedirectSeed[] = [
  {
    id: "redir-root-welcome",
    sourcePath: "/",
    destinationPath: "/welcome/",
    statusCode: 308,
    active: true,
  },
  {
    id: "redir-iptv-subscription",
    sourcePath: "/iptv-subscription/",
    destinationPath: "/iptv-subscriptions-uk/",
    statusCode: 301,
    active: true,
  },
  {
    id: "redir-iptv-subscriptions",
    sourcePath: "/iptv-subscriptions/",
    destinationPath: "/iptv-subscriptions-uk/",
    statusCode: 301,
    active: true,
  },
];

export function toRedirectRule(seed: ManagedRedirectSeed, now = new Date().toISOString()): RedirectRule {
  return {
    ...seed,
    createdAt: now,
    updatedAt: now,
  };
}
