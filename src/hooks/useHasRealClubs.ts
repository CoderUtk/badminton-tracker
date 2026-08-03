import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { listRealClubs } from "../repos/clubRepo";

/**
 * Hook that checks if the user has joined any real (non-personal) clubs.
 * Returns a boolean indicating club membership status.
 * 
 * The check runs on initial mount and whenever the screen receives focus,
 * ensuring the UI stays in sync with club membership changes.
 */
export function useHasRealClubs(): boolean {
  const [hasRealClubs, setHasRealClubs] = useState(false);
  
  useFocusEffect(
    useCallback(() => {
      void listRealClubs().then((clubs) => {
        setHasRealClubs(clubs.length > 0);
      });
    }, [])
  );
  
  return hasRealClubs;
}
