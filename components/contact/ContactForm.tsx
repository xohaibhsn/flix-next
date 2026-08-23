"use client";

import { useState, type FormEvent } from "react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-sm text-ink">
        <p className="font-semibold">Form preview only</p>
        <p className="mt-2 text-muted">
          This local site does not send email or save messages yet. Your details
          were not submitted anywhere.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-brand hover:underline"
          onClick={() => setSubmitted(false)}
        >
          Reset form
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8"
      noValidate
    >
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        UI only — not connected
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Name
          <input
            name="name"
            type="text"
            autoComplete="name"
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
            placeholder="Your name"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
            placeholder="you@example.com"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-ink">
        Subject
        <input
          name="subject"
          type="text"
          className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          placeholder="How can we help?"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink">
        Message
        <textarea
          name="message"
          rows={5}
          className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          placeholder="Tell us about your device, plan, or question."
        />
      </label>
      <button
        type="submit"
        className="mt-6 inline-flex rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 hover:bg-brand-hover"
      >
        Send message
      </button>
    </form>
  );
}
