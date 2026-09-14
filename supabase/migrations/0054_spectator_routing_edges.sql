-- A double-elimination spectator saw the wrong bracket.
--
-- tournament_spectator_view returns every column the read-only bracket needs
-- EXCEPT the two routing edges. The client's double-elim renderer splits
-- winners from losers on `loss_to_match_id` and identifies the grand final as
-- the single row whose `win_to_match_id` is null (see splitDoubleElimRounds),
-- so with both absent it cannot tell the three parts apart and falls back to
-- one flat tree. Because a double-elim bracket's rounds are deliberately
-- non-contiguous, that flat tree rendered a FOUR-entrant draw as five columns
-- headed "ROUND 1 / ROUND OF 16 / QUARTERS / SEMIS / FINAL".
--
-- This is the same defect 0053 fixed for group_idx, and it has the same shape:
-- a column the spectator "never follows" is still the column that tells the
-- renderer what it is looking at. The edges are opaque ids to a spectator —
-- nothing dereferences them — they are only ever tested for null.
--
-- drop-then-create because the return type changes; 0021's comment notes
-- create-or-replace rejects that. The signature (uuid) is unchanged, so this
-- adds no overload — see 0053's finish_bracket_match note for why that
-- distinction matters. Clients built before this migration name the columns
-- they read and simply ignore the two new ones.
drop function if exists public.tournament_spectator_view(uuid);

create function public.tournament_spectator_view(p_tournament_id uuid)
returns table (
  name text,
  status text,
  format text,
  round int,
  idx int,
  match_id uuid,
  entrant_a uuid,
  entrant_b uuid,
  winner_entrant uuid,
  entrant_a_name text,
  entrant_b_name text,
  court text,
  match_status text,
  score_summary jsonb,
  group_idx int,
  src_a text,
  src_b text,
  win_to_match_id uuid,
  loss_to_match_id uuid
)
language sql security definer stable set search_path = public as $$
  select
    t.name,
    t.status,
    coalesce(t.format, 'single_elim'),
    b.round,
    b.idx,
    b.match_id,
    b.entrant_a,
    b.entrant_b,
    b.winner_entrant,
    pa.name as entrant_a_name,
    pb.name as entrant_b_name,
    b.court,
    m.status as match_status,
    m.score_summary,
    b.group_idx,
    b.src_a,
    b.src_b,
    b.win_to_match_id,
    b.loss_to_match_id
  from tournaments t
  left join bracket_matches b on b.tournament_id = t.id
  left join tournament_entrants ea on ea.id = b.entrant_a
  left join club_players pa on pa.id = ea.club_player_id
  left join tournament_entrants eb on eb.id = b.entrant_b
  left join club_players pb on pb.id = eb.club_player_id
  left join matches m on m.id = b.match_id
  where t.id = p_tournament_id
  order by b.round, b.idx;
$$;

grant execute on function public.tournament_spectator_view(uuid) to authenticated;
