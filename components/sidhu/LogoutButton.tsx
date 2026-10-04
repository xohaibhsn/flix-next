import { logoutAction } from "@/lib/auth/actions";
import { cn } from "@/components/sidhu/ui/cn";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={cn(
          "inline-flex items-center text-xs text-white/45 transition-colors hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
          className,
        )}
      >
        Log out
      </button>
    </form>
  );
}
