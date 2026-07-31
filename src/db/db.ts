import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { TOURNAMENT_DDL } from "./schema";

const MIGRATIONS = [
  `create table if not exists matches (
     id text primary key,
     club_id text,
     session_id text,
     config text not null,
     side_a text not null,
     side_b text not null,
     status text not null default 'live',
     winner text,
     score_summary text,
     created_at integer not null,
     synced integer not null default 0
   );
   create table if not exists match_events (
     match_id text not null,
     seq integer not null,
     event text not null,
     synced integer not null default 0,
     primary key (match_id, seq)
   );
   create table if not exists clubs_cache (
     id text primary key, name text not null, invite_code text, role text
   );
   create table if not exists club_players_cache (
     id text primary key, club_id text not null, profile_id text, name text not null
   );`,
  `create table if not exists sessions_cache (
     id text primary key,
     club_id text not null,
     starts_at integer not null,
     ends_at integer,
     location text,
     courts integer not null default 1,
     status text not null default 'scheduled',
     created_at integer not null,
     synced integer not null default 0
   );
   create table if not exists attendance_cache (
     session_id text not null,
     club_player_id text not null,
     status text not null default 'in',
     synced integer not null default 0,
     primary key (session_id, club_player_id)
   );
   create index if not exists sessions_cache_club_starts on sessions_cache (club_id, starts_at desc);
   create index if not exists attendance_cache_session on attendance_cache (session_id);`,
  TOURNAMENT_DDL,
];

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Opens (and migrates) the local database. Native only — on web the app runs
 * without local persistence and callers must handle a null database.
 *
 * The in-flight open promise is memoized so concurrent callers at boot
 * (seed, sync listener, match screen) share a single open. Opening the same
 * database file multiple times in parallel crashes Android's native SQLite
 * with a NullPointerException in prepareAsync.
 */
export async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === "web") return null;
  if (!dbPromise) dbPromise = openAndMigrate();
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const SQLite = await import("expo-sqlite");
  const db = await SQLite.openDatabaseAsync("badminton.db");
  await db.execAsync("pragma journal_mode = wal;");
  const { user_version } = (await db.getFirstAsync<{ user_version: number }>(
    "pragma user_version"
  ))!;
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`pragma user_version = ${v + 1}`);
  }
  return db;
}
