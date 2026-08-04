-- A court may be changed until the match starts. Once bracket_matches.match_id
-- is set, players are already on court and a change strands them.
create or replace function public.assign_bracket_court(
  p_bracket_match_id uuid,
  p_court text
) returns void language plpgsql security definer set search_path = public as $$
declare v_tourney uuid; v_match uuid;
begin
  select tournament_id, match_id into v_tourney, v_match
  from bracket_matches where id = p_bracket_match_id;
  if v_tourney is null then raise exception 'Match not found'; end if;
  if not is_tournament_staff(v_tourney) then
    raise exception 'Only staff can assign a court';
  end if;
  if v_match is not null then
    raise exception 'This match has already started';
  end if;
  update bracket_matches set court = p_court where id = p_bracket_match_id;
end $$;
