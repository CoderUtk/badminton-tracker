import { supabase } from "../lib/supabase";

/**
 * Turn an anonymous session into a real account.
 *
 * `updateUser` on an anonymous session is the supported upgrade path and it
 * KEEPS THE SAME auth.users.id. That is the whole feature: every guest_matches
 * row is owned by `created_by = auth.uid()` (0043), so preserving the id means
 * the history carries over with no data migration, no idempotency problem, and
 * nothing for the 0044 purge to take.
 *
 * Signing up with supabase.auth.signUp() instead would mint a NEW id and
 * orphan everything they scored — which is what the app did before, and why
 * guest mode leaked every user it earned.
 */
export async function upgradeGuestAccount(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Sign-up is unavailable right now");
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Sign-up is unavailable right now");
  if (!user.is_anonymous) throw new Error("You already have an account");

  const { error } = await supabase.auth.updateUser({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);

  // Deliberately no local cleanup here. On native the guest match id list is
  // cleared by the sign-out path in app/guest.tsx; this path never signs out,
  // so the same device keeps showing the same matches — now under a permanent
  // account. Clearing here would hide history the upgrade just rescued.
}

/**
 * Whether the project requires email confirmation is a server setting the
 * client cannot read, so the caller is told to check their inbox either way
 * rather than being promised an instant upgrade that may not have happened.
 */
export const UPGRADE_CONFIRM_HINT =
  "Check your email to confirm the address. Your matches are already saved to this account.";
