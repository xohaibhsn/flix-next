import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/components/sidhu/ui/cn";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

export function TableToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-line bg-admin-surface px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableSearch({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  id = "sidhu-table-search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1 sm:max-w-xs", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-line bg-admin-surface px-3 py-2 text-sm text-ink",
          "outline-none transition-colors placeholder:text-muted/70",
          "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
        )}
      />
    </div>
  );
}

export function DataTableShell({
  children,
  toolbar,
  className,
}: {
  children: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard padding="none" className={cn("overflow-hidden", className)}>
      {toolbar}
      {children}
    </SectionCard>
  );
}

export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function DataTable({
  children,
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { children: ReactNode }) {
  return (
    <table className={cn("w-full min-w-[36rem] text-left text-sm", className)} {...props}>
      {children}
    </table>
  );
}

export function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead className={cn("bg-paper text-xs tracking-wide text-muted uppercase", className)}>
      {children}
    </thead>
  );
}

export function Th({
  children,
  className,
  hideBelow,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  hideBelow?: "sm" | "md" | "lg";
}) {
  const hide =
    hideBelow === "sm"
      ? "hidden sm:table-cell"
      : hideBelow === "md"
        ? "hidden md:table-cell"
        : hideBelow === "lg"
          ? "hidden lg:table-cell"
          : "";
  return (
    <th scope="col" className={cn("px-4 py-3 font-semibold", hide, className)} {...props}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  hideBelow,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  hideBelow?: "sm" | "md" | "lg";
}) {
  const hide =
    hideBelow === "sm"
      ? "hidden sm:table-cell"
      : hideBelow === "md"
        ? "hidden md:table-cell"
        : hideBelow === "lg"
          ? "hidden lg:table-cell"
          : "";
  return (
    <td className={cn("px-4 py-3 align-middle", hide, className)} {...props}>
      {children}
    </td>
  );
}

export function TableRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <tr className={cn("border-t border-line", className)}>{children}</tr>;
}

/** Stacked cards for narrow viewports when a full table is too wide. */
export function ListStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-line md:hidden", className)}>{children}</div>;
}

export function ListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <article className={cn("space-y-2 p-4", className)}>{children}</article>;
}
