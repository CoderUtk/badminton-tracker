import { create } from "zustand";
import type { MatchEvent, MatchState } from "../engine";
import { replay, undo as undoLog } from "../engine";
import * as repo from "../repos/matchRepo";
import { syncNow } from "../sync/runner";

interface MatchStore {
  matchId: string | null;
  events: MatchEvent[];
  redoStack: MatchEvent[];
  state: MatchState | null;
  /** Load an existing match's log (resume) or start tracking a fresh one. */
  open: (matchId: string) => Promise<void>;
  dispatch: (event: MatchEvent) => void;
  undo: () => void;
  redo: () => void;
  /** End the match early, saving the current score to history. */
  endEarly: () => Promise<void>;
  close: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  matchId: null,
  events: [],
  redoStack: [],
  state: null,

  open: async (matchId) => {
    const events = await repo.loadEvents(matchId);
    set({ matchId, events, redoStack: [], state: events.length ? replay(events) : null });
  },

  dispatch: (event) => {
    const { matchId, events } = get();
    const next = [...events, event];
    const state = replay(next);
    set({ events: next, state, redoStack: [] });
    if (matchId) {
      // seq is the event's index in the log — deterministic across devices
      void repo.appendEvent(matchId, next.length - 1, event);
      if (state.phase === "match_over") {
        void repo.finalizeMatch(matchId, state).then(() => syncNow());
      }
    }
  },

  undo: () => {
    const { matchId, events, redoStack } = get();
    if (events.length < 2) return;
    const undone = events[events.length - 1];
    const next = undoLog(events);
    set({ events: next, state: replay(next), redoStack: [...redoStack, undone] });
    if (matchId) void repo.removeEventsAfter(matchId, next.length - 1);
  },

  redo: () => {
    const { matchId, events, redoStack } = get();
    if (!redoStack.length) return;
    const event = redoStack[redoStack.length - 1];
    const next = [...events, event];
    set({ events: next, state: replay(next), redoStack: redoStack.slice(0, -1) });
    if (matchId) void repo.appendEvent(matchId, next.length - 1, event);
  },

  endEarly: async () => {
    const { matchId, state } = get();
    if (!matchId || !state) return;
    await repo.endMatchEarly(matchId, state);
    void syncNow();
  },

  close: () => set({ matchId: null, events: [], redoStack: [], state: null }),
}));
