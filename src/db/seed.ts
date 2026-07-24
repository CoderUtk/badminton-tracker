import { getDb } from "./db";

const DEMO_CLUB_ID = "demo-club";
const DEMO_PLAYERS = ["Shreesh", "Dhiraj", "Soham", "Utkarsh", "Aarav", "Meera"];

/**
 * Offline-only mode: seed a local demo club and players so every feature is
 * testable without an account. No-op if the club already exists or on web.
 */
export async function seedDemoData(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "insert or ignore into clubs_cache (id, name, invite_code, role) values (?, ?, ?, ?)",
      DEMO_CLUB_ID, "Demo Club", null, "owner"
    );
    for (let i = 0; i < DEMO_PLAYERS.length; i++) {
      await db.runAsync(
        "insert or ignore into club_players_cache (id, club_id, profile_id, name) values (?, ?, ?, ?)",
        `demo-player-${i}`, DEMO_CLUB_ID, null, DEMO_PLAYERS[i]
      );
    }
    await db.runAsync(
      `insert or ignore into sessions_cache
       (id, club_id, starts_at, location, courts, status, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      "demo-session", DEMO_CLUB_ID, Date.now() + 2 * 60 * 60 * 1000,
      "Demo Sports Hall", 2, "scheduled", Date.now()
    );
  });
}
