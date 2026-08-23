import { logoutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-xs text-white/45 hover:text-white"
      >
        Log out
      </button>
    </form>
  );
}
