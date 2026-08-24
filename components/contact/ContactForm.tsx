"use client";

import { useState, type FormEvent } from "react";
import { submitContactAction } from "@/lib/cms/actions";
import type { ContactFormData } from "@/lib/cms/types";

const fallback: ContactFormData = {
  heading: "Send a message",
  description: "",
  nameLabel: "Name",
  emailLabel: "Email",
  phoneLabel: "Phone (optional)",
  subjectLabel: "Subject",
  messageLabel: "Message",
  buttonLabel: "Send message",
  successMessage: "Thanks — your message was received.",
};

export function ContactForm({ labels }: { labels?: Partial<ContactFormData> }) {
  const copy = { ...fallback, ...labels };
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("saving");
    setError("");
    const result = await submitContactAction({
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      phone: String(data.get("phone") || ""),
      subject: String(data.get("subject") || ""),
      message: String(data.get("message") || ""),
      company: String(data.get("company") || ""),
    });
    if (result.ok) {
      setStatus("ok");
      form.reset();
      return;
    }
    setStatus("error");
    setError(result.error);
  }

  if (status === "ok") {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-sm text-ink">
        <p className="font-semibold">Message received</p>
        <p className="mt-2 text-muted">{copy.successMessage}</p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-brand hover:underline"
          onClick={() => setStatus("idle")}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          {copy.nameLabel}
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          {copy.emailLabel}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-ink">
        {copy.phoneLabel}
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink">
        {copy.subjectLabel}
        <input
          name="subject"
          type="text"
          required
          className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink">
        {copy.messageLabel}
        <textarea
          name="message"
          required
          rows={5}
          className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
      </label>
      <div className="hidden" aria-hidden="true">
        <input name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {status === "error" ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={status === "saving"}
        className="mt-6 inline-flex rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 hover:bg-brand-hover disabled:opacity-60"
      >
        {status === "saving" ? "Sending…" : copy.buttonLabel}
      </button>
    </form>
  );
}
