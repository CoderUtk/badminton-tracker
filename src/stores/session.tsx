import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface SessionCtx {
  session: Session | null;
  loading: boolean;
  /** True when no Supabase env is configured — app runs offline-only. */
  offlineOnly: boolean;
}

const Ctx = createContext<SessionCtx>({ session: null, loading: true, offlineOnly: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ session, loading, offlineOnly: !supabase }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
