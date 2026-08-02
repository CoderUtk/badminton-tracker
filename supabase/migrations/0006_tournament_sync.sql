-- supabase/migrations/0006_tournament_sync.sql
-- Adds the Phase-2 tournament columns that exist locally but never reached
-- the server, plus the atomic RPC that advances a bracket cell's winner into
-- its parent cell without a client-side read-modify-write race.

alter table public.tournaments add column if not exists match_type text not null default 'singles';
alter table public.tournaments add column if not exists bestof int not null default 3;
alter table public.tournaments add column if not exists finals_bestof int not null default 3;
alter table public.tournament_entrants add column if not exists club_player_id_2 uuid references public.club_players (id) on delete set null;

-- Single-elimination bracket math is purely positional: a cell at (round, idx)
-- feeds parent cell (round+1, idx/2), landing in entrant_a when idx is even,
-- entrant_b when odd — verified against src/tournament/bracket.ts's
-- advanceWinner, which uses the identical Math.floor(idx/2) + idx%2 rule.
-- Updating only that one column (never the whole row) is what makes two
-- sibling matches finishing seconds apart race-free: neither statement reads
-- the other's column before writing.
create or replace function public.finish_bracket_match(p_bracket_match_id uuid, p_winner_entrant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tournament_id uuid;
  v_round int;
  v_idx int;
  v_entrant_a uuid;
  v_entrant_b uuid;
  v_club_id uuid;
  v_max_round int;
  v_parent_round int;
  v_parent_idx int;
begin
  select tournament_id, round, idx, entrant_a, entrant_b
    into v_tournament_id, v_round, v_idx, v_entrant_a, v_entrant_b
    from bracket_matches where id = p_bracket_match_id;
  if v_tournament_id is null then
    raise exception 'Bracket match not found';
  end if;

  select club_id into v_club_id from tournaments where id = v_tournament_id;
  if not is_club_member(v_club_id) then
    raise exception 'Not a member of this tournament''s club';
  end if;
  if p_winner_entrant is null then
    raise exception 'Winner entrant is required';
  end if;
  if p_winner_entrant is distinct from v_entrant_a and p_winner_entrant is distinct from v_entrant_b then
    raise exception 'Winner is not one of this match''s entrants';
  end if;

  update bracket_matches set winner_entrant = p_winner_entrant where id = p_bracket_match_id;

  select max(round) into v_max_round from bracket_matches where tournament_id = v_tournament_id;
  if v_round = v_max_round then
    update tournaments set status = 'done' where id = v_tournament_id;
    return;
  end if;

  v_parent_round := v_round + 1;
  v_parent_idx := v_idx / 2;

  if v_idx % 2 = 0 then
    update bracket_matches set entrant_a = p_winner_entrant
      where tournament_id = v_tournament_id and round = v_parent_round and idx = v_parent_idx;
  else
    update bracket_matches set entrant_b = p_winner_entrant
      where tournament_id = v_tournament_id and round = v_parent_round and idx = v_parent_idx;
  end if;

  update tournaments set status = 'live' where id = v_tournament_id;
end $$;

-- tournament_entrants and bracket_matches are already `on delete cascade`
-- from tournaments (0002_tournaments.sql:12,18), and cascades bypass RLS,
-- so this single parent policy is sufficient for deleteTournament.
create policy "admins delete tournaments" on public.tournaments for delete to authenticated
  using (is_club_admin(club_id));
