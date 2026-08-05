-- Read-only bracket view for the spectator join link. No membership or
-- approval required — the link itself is the access grant, scoped to
-- exactly the tournament id passed in (not a table-wide RLS relaxation).
create or replace function public.tournament_spectator_view(p_tournament_id uuid)
returns table (
  name text,
  status text,
  round int,
  idx int,
  match_id uuid,
  entrant_a uuid,
  entrant_b uuid,
  winner_entrant uuid,
  entrant_a_name text,
  entrant_b_name text
)
language sql security definer stable set search_path = public as $$
  select
    t.name,
    t.status,
    b.round,
    b.idx,
    b.match_id,
    b.entrant_a,
    b.entrant_b,
    b.winner_entrant,
    pa.name as entrant_a_name,
    pb.name as entrant_b_name
  from tournaments t
  left join bracket_matches b on b.tournament_id = t.id
  left join tournament_entrants ea on ea.id = b.entrant_a
  left join club_players pa on pa.id = ea.club_player_id
  left join tournament_entrants eb on eb.id = b.entrant_b
  left join club_players pb on pb.id = eb.club_player_id
  where t.id = p_tournament_id
  order by b.round, b.idx;
$$;

grant execute on function public.tournament_spectator_view(uuid) to authenticated;
