export function WhatsAppButton({ href }: { href: string }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="wa-pulse fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#1ebe5d]"
      aria-label="Chat on WhatsApp"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
        <path d="M20.5 3.5A11 11 0 0 0 2.1 17.7L1 23l5.4-1.1A11 11 0 0 0 12 23a11 11 0 0 0 8.5-19.5zM12 21a9 9 0 0 1-4.6-1.3l-.3-.2-3.2.7.7-3.1-.2-.3A9 9 0 1 1 12 21zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5.3-.4c.1-.1 0-.3 0-.4l-.9-2.1c-.2-.5-.5-.4-.6-.4h-.5c-.2 0-.4.1-.6.3s-.8.8-.8 1.9.8 2.2.9 2.3c.1.2 1.6 2.5 3.8 3.5 1.6.7 2 .7 2.7.6.4-.1 1.6-.7 1.8-1.3s.2-1.2.2-1.3-.2-.2-.4-.3z" />
      </svg>
      Chat on WhatsApp
    </a>
  );
}
