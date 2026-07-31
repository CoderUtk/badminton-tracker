import { create } from "zustand";
import type { MatchEvent, MatchState } from "../engine";
import { replay, undo as undoLog } from "../engine";
import * as repo from "../repos/matchRepo";
import { syncNow } from "../sync/runner";
import { getRealtimeBackend } from "../realtime";

const summarize = (s: MatchState) => `${s.gamesWon.A}-${s.gamesWon.B} (${s.score.A}-${s.score.B})`;

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
    const state = events.length ? replay(events) : null;
    set({ matchId, events, redoStack: [], state });
    // Mark the match live for spectators (best-effort; presence only).
    if (state && state.phase !== "match_over") {
      const record = await repo.getMatch(matchId);
      if (record) {
        getRealtimeBackend().setLive({
          matchId,
          clubId: record.club_id ?? "",
          teamA: record.side_a.map((p) => p.name),
          teamB: record.side_b.map((p) => p.name),
          scoreSummary: summarize(state),
        });
      }
    }
  },

  dispatch: (event) => {
    const { matchId, events } = get();
    const next = [...events, event];
    const state = replay(next);
    set({ events: next, state, redoStack: [] });
    if (matchId) {
      // seq is the event's index in the log — deterministic across devices
      void repo.appendEvent(matchId, next.length - 1, event);
      // Publish to spectators — best-effort, never blocks scoring (already in SQLite).
      void getRealtimeBackend().publishEvent(matchId, event).catch(() => {});
      if (state.phase === "match_over") {
        getRealtimeBackend().clearLive(matchId);
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
    getRealtimeBackend().clearLive(matchId);
    void syncNow();
  },

  close: () => set({ matchId: null, events: [], redoStack: [], state: null }),
}));
