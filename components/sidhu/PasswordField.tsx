"use client";

import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "@/components/sidhu/fields";

export function PasswordField({
  name,
  label,
  autoComplete,
  required = true,
  hint,
}: {
  name: string;
  label: string;
  autoComplete?: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  required?: boolean;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="text-xs font-semibold tracking-wide text-ink/70 uppercase">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      <div className="relative mt-1.5">
        <input
          className={`${inputClass} pr-16`}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-ink"
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}
