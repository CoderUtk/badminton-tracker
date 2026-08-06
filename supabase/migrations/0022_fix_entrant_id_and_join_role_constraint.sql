-- tournament_entrants.id (0002_tournaments.sql:11) has no default. Every
-- caller that inserts a row supplies id explicitly (tournamentRepo.ts) except
-- approve_tournament_join (0013_join_request_roles.sql:85-86), which omits
-- it entirely — every approval of a player join request hit "null value in
-- column id violates not-null constraint".
alter table public.tournament_entrants alter column id set default gen_random_uuid();

-- tournament_join_requests' unique constraint (0007_tournament_live_ops.sql:10)
-- is (tournament_id, profile_id) only, but request_tournament_join's
-- duplicate-request check (0013_join_request_roles.sql:41-43) is scoped by
-- role. A profile with a pending 'player' request that then requests
-- 'scorer' for the same tournament passes the role-scoped check and hits
-- the role-blind constraint — "duplicate key value violates unique
-- constraint tournament_join_requests_tournament_id_profile_id_key". Widen
-- the constraint to match the function's actual intent: one pending request
-- per (tournament, profile, role), not per (tournament, profile).
alter table public.tournament_join_requests
  drop constraint tournament_join_requests_tournament_id_profile_id_key;
alter table public.tournament_join_requests
  add constraint tournament_join_requests_tournament_id_profile_id_role_key
  unique (tournament_id, profile_id, role);
