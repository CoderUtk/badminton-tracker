import { supabase } from "./supabase";
import { toast } from "./toast";

/**
 * Turn an OAuth callback URL into a session. Handles the implicit flow (tokens
 * in the hash), PKCE (`?code=`), and provider errors.
 *
 * Returns "session" only when a session was actually established. Callers
 * that show a loading state must keep it up in that case — Gate (in
 * app/_layout.tsx) still needs its own async profile round trip before it
 * navigates away from sign-in.
 */
export async function completeAuth(callbackUrl: string): Promise<"session" | "error" | "none"> {
  if (!supabase) return "none";
  const params = new URL(callbackUrl.replace("#", "?")).searchParams;

  const providerError = params.get("error_description") ?? params.get("error");
  if (providerError) { toast(providerError, "error"); return "error"; }

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) { toast(error.message, "error"); return "error"; }
    return "session";
  }

  const authCode = params.get("code");
  if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) { toast(error.message, "error"); return "error"; }
    return "session";
  }

  return "none";
}

/** True when a URL looks like an OAuth/email-link callback worth handling. */
export function isAuthCallbackUrl(url: string): boolean {
  return url.includes("access_token") || url.includes("code=") || url.includes("error");
}
