import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { completeAuth, isAuthCallbackUrl } from "../lib/authCallback";

interface SessionCtx {
  session: Session | null;
  loading: boolean;
  // True from the moment an OAuth/email-link callback is caught until it
  // resolves into a session (or fails). Lives here, not in the sign-in
  // screen, because a path-less deep link (`badminton://#access_token=...`,
  // seen when Supabase's redirect allow-list drops our `/auth` segment)
  // makes expo-router briefly navigate to "/" while session is still null —
  // Gate then bounces back to /sign-in, remounting it. A flag stored on that
  // screen resets on that remount and stops reflecting reality; this
  // provider never remounts, so it doesn't.
  completingAuth: boolean;
  // Exposed so googleSignIn's own WebBrowser result (which carries the
  // callback URL directly, without going through the Linking "url" event on
  // every platform) can complete sign-in through the same, remount-proof
  // state instead of keeping a parallel copy.
  handleAuthCallback: (url: string) => void;
  // Call the instant the Google button is tapped, before the browser even
  // opens — closes the gap between the browser dismissing and the Linking
  // "url" event actually reaching JS, which otherwise flashes the plain
  // sign-in form for a moment on return.
  beginAuthAttempt: () => void;
  // Call when the auth browser closes without a "success" result. Only
  // clears completingAuth if no callback URL ever arrived (handledUrl still
  // unset) — a real user cancel. If a callback IS in flight (Android's
  // redirect races the browser's own dismiss result), leaves it alone so it
  // doesn't clear a spinner that a genuine sign-in still needs.
  cancelAuthAttempt: () => void;
}

const Ctx = createContext<SessionCtx>({
  session: null,
  loading: true,
  completingAuth: false,
  handleAuthCallback: () => {},
  beginAuthAttempt: () => {},
  cancelAuthAttempt: () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingAuth, setCompletingAuth] = useState(false);
  // Same callback URL can arrive more than once (seen: 3x for a single
  // Google sign-in) — process it once.
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      // Misconfiguration: without env vars the app cannot authenticate. Stop
      // loading so the sign-in screen renders and surfaces the problem.
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        // Safety net: a stuck-true completingAuth otherwise survives sign-out
        // forever, since nothing else on the sign-out path touches it — the
        // next visit to /sign-in would render as a permanent "Signing you
        // in…" spinner with no way out.
        setCompletingAuth(false);
        handledUrl.current = null;
      }
    });

    const linkSub = Linking.addEventListener("url", ({ url }) => handleAuthCallback(url));
    void Linking.getInitialURL().then((url) => { if (url) handleAuthCallback(url); });

    return () => {
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const handleAuthCallback = (url: string) => {
    if (!isAuthCallbackUrl(url) || handledUrl.current === url) return;
    handledUrl.current = url;
    setCompletingAuth(true);
    void completeAuth(url).then((status) => {
      if (status !== "session") setCompletingAuth(false);
    });
  };

  const beginAuthAttempt = () => setCompletingAuth(true);

  const cancelAuthAttempt = () => {
    if (handledUrl.current === null) setCompletingAuth(false);
  };

  return (
    <Ctx.Provider
      value={{ session, loading, completingAuth, handleAuthCallback, beginAuthAttempt, cancelAuthAttempt }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
