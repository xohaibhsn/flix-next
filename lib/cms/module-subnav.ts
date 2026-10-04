export type ModuleSubNavItem = {
  id: string;
  label: string;
  href: string;
  /** When true, only the exact normalized path is active (not nested routes). */
  exact?: boolean;
};

function normalizeAdminPath(pathname: string) {
  if (!pathname) return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** Pure active matcher — serializable item data only; safe for Server and Client. */
export function isModuleSubNavItemActive(
  pathname: string,
  item: Pick<ModuleSubNavItem, "href" | "exact">,
) {
  const path = normalizeAdminPath(pathname);
  const target = normalizeAdminPath(item.href);
  if (item.exact) return path === target;
  return path === target || path.startsWith(target);
}
