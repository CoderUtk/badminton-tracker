import * as Linking from "expo-linking";
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

  const { error } = await supabase.auth.updateUser(
    { email: email.trim(), password },
    // Without this the confirmation link lands on the bare Site URL instead of
    // coming back into the app, exactly as sign-in.tsx's signUp/reset do.
    //
    // This URL has to match the project's Redirect URLs allowlist or GoTrue
    // silently drops it and falls back to Site URL. The list was
    // `badminton://,exp://**`, which does NOT match `badminton:///auth`; it is
    // now `badminton://,badminton://**,exp://**,https://courtside-links.vercel.app/**`.
    // Change this expression and you have to widen that list too.
    { emailRedirectTo: Linking.createURL("auth") },
  );
  if (error) throw new Error(error.message);

  // Deliberately no local cleanup here. On native the guest match id list is
  // cleared by the sign-out path in app/guest.tsx; this path never signs out,
  // so the same device keeps showing the same matches — now under a permanent
  // account. Clearing here would hide history the upgrade just rescued.
}

/**
 * The account is not permanent until the emailed link is opened: until then the
 * user is still `is_anonymous`, so the 30-day guest purge (0055) still counts
 * their rows. Promising "already saved" here overstated a confirmation that can
 * still fail, so the copy names the remaining step.
 */
export const UPGRADE_CONFIRM_HINT =
  "Check your email and tap the link to finish. Your matches stay on this account " +
  "once the address is confirmed.";
