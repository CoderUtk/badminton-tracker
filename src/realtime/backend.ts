import type { MatchEvent } from "../engine/types";

export type LiveMatch = { matchId: string; clubId: string; teamA: string[]; teamB: string[]; scoreSummary: string };
export type Unsubscribe = () => void;

export interface RealtimeBackend {
  publishEvent(matchId: string, event: MatchEvent): Promise<void>;
  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe;
  listLiveMatches(clubId: string): Promise<LiveMatch[]>;
  onLiveMatchesChange(clubId: string, cb: (list: LiveMatch[]) => void): Unsubscribe;
  setLive(m: LiveMatch): void;
  clearLive(matchId: string): void;
}

export class LocalBackend implements RealtimeBackend {
  private subs = new Map<string, Set<(e: MatchEvent) => void>>();
  private live = new Map<string, LiveMatch>();
  private liveSubs = new Map<string, Set<(l: LiveMatch[]) => void>>();

  async publishEvent(matchId: string, event: MatchEvent): Promise<void> {
    this.subs.get(matchId)?.forEach((cb) => cb(event));
  }
  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe {
    const set = this.subs.get(matchId) ?? new Set();
    set.add(cb); this.subs.set(matchId, set);
    return () => set.delete(cb);
  }
  async listLiveMatches(clubId: string): Promise<LiveMatch[]> {
    return [...this.live.values()].filter((m) => m.clubId === clubId);
  }
  onLiveMatchesChange(clubId: string, cb: (l: LiveMatch[]) => void): Unsubscribe {
    const set = this.liveSubs.get(clubId) ?? new Set();
    set.add(cb); this.liveSubs.set(clubId, set);
    return () => set.delete(cb);
  }
  setLive(m: LiveMatch): void { this.live.set(m.matchId, m); this.emitLive(m.clubId); }
  clearLive(matchId: string): void {
    const m = this.live.get(matchId); this.live.delete(matchId);
    if (m) this.emitLive(m.clubId);
  }
  private emitLive(clubId: string): void {
    const list = [...this.live.values()].filter((m) => m.clubId === clubId);
    this.liveSubs.get(clubId)?.forEach((cb) => cb(list));
  }
}
