import { SupabaseBackend } from "../src/realtime/supabaseBackend";

describe("SupabaseBackend", () => {
  test("subscribes to the match_events channel", () => {
    const channel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnValue(undefined),
    };
    const client = {
      channel: jest.fn().mockReturnValue(channel),
      removeChannel: jest.fn(),
    };

    const backend = new SupabaseBackend(client as any);
    const cb = jest.fn();

    backend.subscribe("m1", cb);

    expect(client.channel).toHaveBeenCalledWith("match:m1");
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "match_events",
        filter: "match_id=eq.m1",
      },
      expect.any(Function)
    );
  });
});
