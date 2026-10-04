"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { ICON_OPTIONS } from "@/lib/cms/icons";
import { Alert, type AlertTone } from "@/components/sidhu/ui/Alert";
import { HelpText } from "@/components/sidhu/ui/HelpText";
import { cn } from "@/components/sidhu/ui/cn";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-ink/70 uppercase">{label}</span>
      {hint ? <HelpText>{hint}</HelpText> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass = cn(
  "w-full rounded-md border border-line bg-admin-surface px-3 py-2 text-sm text-ink",
  "outline-none transition-colors",
  "placeholder:text-muted/70",
  "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted",
);

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "min-h-24", props.className)} />;
}

export function IconSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      {ICON_OPTIONS.map((icon) => (
        <option key={icon.name} value={icon.name}>
          {icon.label}
        </option>
      ))}
    </select>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error" | "info" | "warning";
  children: ReactNode;
}) {
  const alertTone: AlertTone = tone === "ok" ? "ok" : tone;
  return (
    <Alert tone={alertTone} role={tone === "error" ? "alert" : "status"}>
      {children}
    </Alert>
  );
}

export function RowActions({
  onUp,
  onDown,
  onRemove,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const quiet =
    "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-line bg-admin-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={quiet} onClick={onUp}>
        Up
      </button>
      <button type="button" className={quiet} onClick={onDown}>
        Down
      </button>
      <button
        type="button"
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-red-200 bg-admin-surface px-2.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}
