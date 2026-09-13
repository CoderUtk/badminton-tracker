import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0053_tournament_formats.sql"), "utf8");

const COLUMNS = ["win_to_match_id", "win_to_slot", "loss_to_match_id", "loss_to_slot",
                 "group_idx", "src_a", "src_b"];

test("adds every routing column re-runnably", () => {
  for (const c of COLUMNS) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${c}\\b`));
  }
  expect(sql).toMatch(/add column if not exists group_count int/);
  expect(sql).toMatch(/add column if not exists advance_per_group int/);
});

// A foreign key here is checked per row, and start_tournament inserts the whole
// bracket in one statement from jsonb_array_elements, where a round-1 row
// references a round-2 row in the same batch with no ordering guarantee. The FK
// would fail the first insert and kill every tournament start.
test("the routing columns carry no foreign key", () => {
  const alter = sql.slice(sql.indexOf("alter table public.bracket_matches"),
                          sql.indexOf("update public.bracket_matches"));
  expect(alter).not.toMatch(/references/i);
});

test("slots are constrained to a and b", () => {
  expect(sql).toMatch(/win_to_slot\s+text\s+check \(win_to_slot in \('a','b'\)\)/);
  expect(sql).toMatch(/loss_to_slot\s+text\s+check \(loss_to_slot in \('a','b'\)\)/);
});

test("the backfill only touches rows that have no edge yet", () => {
  const backfill = sql.slice(sql.indexOf("update public.bracket_matches"));
  expect(backfill).toMatch(/m\.win_to_match_id is null/);
  expect(backfill).toMatch(/p\.idx\s*=\s*m\.idx \/ 2/);
});

// The (tournament_id, round, idx) join key the backfill uses is only unique
// for a tree bracket: groupsKnockout.build numbers each group's matches from
// round 1 with a per-group index, so re-running this on a tournament with
// group brackets would match multiple parent rows and stamp an arbitrary win
// edge onto a live group match. Scoping to single_elim shrinks the lock
// footprint too.
test("the module-level backfill is scoped to single_elim tournaments", () => {
  const backfill = sql.slice(
    sql.indexOf("update public.bracket_matches"),
    sql.indexOf("function public.finish_bracket_match"),
  );
  expect(backfill).toMatch(/join public\.tournaments t on t\.id = p\.tournament_id/);
  expect(backfill).toMatch(/coalesce\(t\.format, 'single_elim'\) = 'single_elim'/);
});

test("finish_bracket_match follows edges and no longer does tree math", () => {
  const fn = sql.slice(sql.indexOf("function public.finish_bracket_match"),
                       sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/v_win_to/);
  expect(fn).toMatch(/p_slot_fills jsonb default/);
  expect(fn).not.toMatch(/v_idx \/ 2/);
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
  // Carried over from 0006 verbatim.
  expect(fn).toMatch(/if not is_club_member\(v_club_id\) then/);
  expect(fn).toMatch(/Winner is not one of this match''s entrants/);
});

test("a slot already holding the same entrant is success, a different one is not", () => {
  const fn = sql.slice(sql.indexOf("function public.finish_bracket_match"),
                       sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/Slot already filled by a different entrant/);
});

test("an invalid or missing slot value in a fill is rejected, not defaulted to b", () => {
  const fn = sql.slice(sql.indexOf("function public.finish_bracket_match"),
                       sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/coalesce\(v_fill->>'slot', ''\)\s+not in \('a','b'\)/);
  expect(fn).toMatch(/Slot fill has an invalid slot/);
});

test("start_tournament keeps the single_elim size check exactly", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/v_draw - 1/);
  expect(fn).toMatch(/v_format/);
  // Every guard from 0012 survives.
  expect(fn).toMatch(/is_club_admin\(v_club\) or is_tournament_admin\(p_tournament_id\)/);
  expect(fn).toMatch(/This tournament has already started/);
  expect(fn).toMatch(/This tournament already has a bracket/);
  expect(fn).toMatch(/Bracket references entrants from another tournament/);
});

test("start_tournament validates routing structurally", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/Bracket routing references a match outside this tournament/);
});

// A 1.6.x client's bracketMatchToRow emits no routing keys at all, so every
// edge in its payload inserts as NULL. That payload passes every existing
// check (format is single_elim, length matches v_draw - 1, entrants check
// out, and the routing-graph validation only rejects a target OUTSIDE the
// payload — zero edges pass trivially), so without this the bracket is
// permanently dead: finish_bracket_match reads v_win_to as NULL forever.
test("start_tournament backfills single_elim tree edges after insert, for old clients", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  const afterInsert = fn.slice(fn.indexOf("from jsonb_array_elements(p_bracket) e;"));
  expect(afterInsert).toMatch(/if v_format = 'single_elim' then/);
  expect(afterInsert).toMatch(/update bracket_matches m set/);
  expect(afterInsert).toMatch(/m\.tournament_id = p_tournament_id/);
  expect(afterInsert).toMatch(/m\.win_to_match_id is null/);
});

// startBlocker/minPlayers on the client (src/tournament/draw.ts) allows a
// 3-player singles round-robin; the server must agree or the Start button is
// enabled for a start the server refuses.
test("start_tournament's minimum-player floor is format-aware and matches startBlocker", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  expect(fn).toMatch(/v_format = 'round_robin'/);
  expect(fn).toMatch(/v_min := case when v_type = 'doubles' then 6 else 3 end/);
  expect(fn).toMatch(/v_format = 'groups_knockout'/);
  expect(fn).toMatch(/v_min := case when v_type = 'doubles' then 12 else 6 end/);
  // single_elim / double_elim keep today's exact values: 4 singles, 6 doubles.
  expect(fn).toMatch(/v_min := case when v_type = 'doubles' then 6 else 4 end/);
});

// `size` means "knockout draw size" everywhere else. For groups_knockout that
// is group_count * advance_per_group rounded up to a power of two, NOT
// nextPowerOfTwo(entrant_count) — 12 entrants in 3 groups of 4 advancing 2 is
// size 8, not 16.
test("groups_knockout's size is the knockout draw size, not the entrant draw", () => {
  const fn = sql.slice(sql.indexOf("function public.start_tournament"));
  const branch = fn.slice(fn.indexOf("elsif v_format = 'groups_knockout'"), fn.indexOf("else\n    raise exception 'Unknown"));
  expect(branch).toMatch(/coalesce\(group_count, 1\), coalesce\(advance_per_group, 2\)/);
  expect(branch).toMatch(/v_ko_slots < v_group_count \* v_advance/);
  expect(branch).toMatch(/v_size := v_ko_slots/);
});

// The public spectator link (no membership required) needs the tournament's
// format to pick a renderer. 0053 replaces 0021's function to add it — this
// checks the replacement adds exactly that column without disturbing 0021's
// live-score columns or the function's signature.
describe("tournament_spectator_view gains format and group routing columns", () => {
  const fn = sql.slice(sql.indexOf("function public.tournament_spectator_view"));

  test("drops before creating, since the return type changes", () => {
    expect(sql).toMatch(/drop function if exists public\.tournament_spectator_view\(uuid\)/);
  });

  test("returns format, defaulted for a pre-0053 row", () => {
    expect(fn).toMatch(/format\s+text,/);
    expect(fn).toMatch(/coalesce\(t\.format, 'single_elim'\)/);
  });

  // Without these a spectator watching a groups → knockout tournament sees
  // every group-stage match drawn through the knockout tree renderer — wrong
  // information about what's happening on court, not a cosmetic shortfall.
  test("returns group_idx, src_a and src_b so the spectator can tell a group match from a knockout one", () => {
    expect(fn).toMatch(/group_idx\s+int,/);
    expect(fn).toMatch(/src_a\s+text,/);
    expect(fn).toMatch(/src_b\s+text/);
    expect(fn).toMatch(/b\.group_idx,/);
    expect(fn).toMatch(/b\.src_a,/);
    expect(fn).toMatch(/b\.src_b/);
  });

  test("every 0021 column survives: court and the live score", () => {
    expect(fn).toMatch(/court\s+text,/);
    expect(fn).toMatch(/match_status\s+text,/);
    expect(fn).toMatch(/score_summary\s+jsonb/);
    expect(fn).toMatch(/m\.status as match_status/);
    expect(fn).toMatch(/m\.score_summary/);
    expect(fn).toMatch(/left join matches m on m\.id = b\.match_id/);
  });

  test("signature and security model are unchanged", () => {
    expect(fn).toMatch(/tournament_spectator_view\(p_tournament_id uuid\)/);
    expect(fn).toMatch(/security definer stable set search_path = public/);
  });

  test("still grants execute to authenticated", () => {
    expect(fn).toMatch(/grant execute on function public\.tournament_spectator_view\(uuid\) to authenticated/);
  });
});
