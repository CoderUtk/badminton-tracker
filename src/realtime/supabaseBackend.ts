import type { MatchEvent } from "../engine/types";
import type { LiveMatch, RealtimeBackend, Unsubscribe } from "./backend";

export type SupabaseLikeClient = {
  channel: (name: string) => {
    on: (event: string, opts: unknown, cb: (payload: any) => void) => any;
    subscribe: () => void;
  };
  removeChannel: (channel: unknown) => void;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string | number | boolean) => Promise<{ data: any[] | null; error: unknown }>;
    };
  };
};

export class SupabaseBackend implements RealtimeBackend {
  constructor(private client: SupabaseLikeClient | null = null) {}

  async publishEvent(_matchId: string, _event: MatchEvent): Promise<void> {
    return;
  }

  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe {
    if (!this.client) return () => {};

    const channel = this.client.channel(`match:${matchId}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "match_events",
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        const event = payload?.new?.event as MatchEvent | undefined;
        if (event) cb(event);
      }
    );

    channel.subscribe();
    return () => this.client?.removeChannel(channel);
  }

  async listLiveMatches(clubId: string): Promise<LiveMatch[]> {
    if (!this.client) return [];

    const { data } = await this.client
      .from("matches")
      .select("id, club_id, side_a, side_b, score_summary, status")
      .eq("club_id", clubId);

    return (data ?? [])
      .filter((m: any) => m.status === "live")
      .map((m: any) => ({
        matchId: m.id,
        clubId: m.club_id,
        teamA: (m.side_a as { name: string }[]).map((p) => p.name),
        teamB: (m.side_b as { name: string }[]).map((p) => p.name),
        scoreSummary: JSON.stringify(m.score_summary ?? {}),
      }));
  }

  onLiveMatchesChange(clubId: string, cb: (list: LiveMatch[]) => void): Unsubscribe {
    if (!this.client) return () => {};

    const channel = this.client.channel(`club-live:${clubId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "matches",
        filter: `club_id=eq.${clubId}`,
      },
      async () => cb(await this.listLiveMatches(clubId))
    );

    channel.subscribe();
    return () => this.client?.removeChannel(channel);
  }

  setLive(_m: LiveMatch): void {}
  clearLive(_matchId: string): void {}
}
