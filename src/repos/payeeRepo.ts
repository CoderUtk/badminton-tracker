import { supabase } from "../lib/supabase";
import { isValidUpiId } from "../lib/upi";

/**
 * The UPI handle a player is paid at.
 *
 * Kept out of `profiles` on purpose: that table's SELECT policy is
 * `using (true)`, so a column there would hand every authenticated user
 * everyone else's payment identifier. payee_handles (0051) has no read policy
 * beyond the owner, and the only way anyone else sees a handle is
 * session_payee_upi() — which answers solely for a session the caller is
 * checked in to and still owes on.
 */

export async function getMyUpiId(): Promise<string | null> {
  if (!supabase) return null;
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("payee_handles").select("upi_id").eq("profile_id", uid).maybeSingle();
  return (data?.upi_id as string | undefined) ?? null;
}

/** Pass null or an empty string to stop being payable. */
export async function setMyUpiId(upiId: string | null): Promise<void> {
  if (!supabase) throw new Error("Sign in to save a UPI ID");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to save a UPI ID");

  const value = upiId?.trim() ?? "";
  if (!value) {
    const { error } = await supabase.from("payee_handles").delete().eq("profile_id", uid);
    if (error) throw new Error(error.message);
    return;
  }
  // Checked here as well as by the column's CHECK constraint so the failure
  // reads as a form error rather than a Postgres constraint name.
  if (!isValidUpiId(value)) throw new Error("That does not look like a UPI ID (name@bank).");

  const { error } = await supabase
    .from("payee_handles")
    .upsert({ profile_id: uid, upi_id: value, updated_at: new Date().toISOString() },
            { onConflict: "profile_id" });
  if (error) throw new Error(error.message);
}

/**
 * The handle to pay for this session, or null when there is nothing to pay,
 * the payer has not set one, or the caller is not owing on it. The RPC cannot
 * distinguish those cases on purpose, so neither can we.
 */
export async function getSessionPayeeUpi(sessionId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("session_payee_upi", { p_session_id: sessionId });
  if (error) return null;
  return (data as string | null) ?? null;
}
