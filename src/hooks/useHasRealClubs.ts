import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { listRealClubs } from "../repos/clubRepo";

/**
 * Whether the user belongs to any real (non-personal) club.
 *
 * Returns null until the first result lands. Callers must render neither
 * branch while it is null — initialising to false made every focus briefly
 * flash the "no clubs" state at users who do have clubs.
 *
 * The cancelled flag matters because this re-runs on every focus: without it a
 * slow earlier request can resolve after a later one and overwrite the newer
 * answer, and it can set state on an unmounted screen.
 */
export function useHasRealClubs(): boolean | null {
  const [hasRealClubs, setHasRealClubs] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listRealClubs().then((clubs) => {
        if (!cancelled) setHasRealClubs(clubs.length > 0);
      });
      return () => { cancelled = true; };
    }, [])
  );

  return hasRealClubs;
}
