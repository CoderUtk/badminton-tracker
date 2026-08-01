create table public.tournaments (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  format text not null default 'single_elim',
  size int not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
create table public.tournament_entrants (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_player_id uuid not null references public.club_players (id) on delete cascade,
  seed int not null
);
create table public.bracket_matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null,
  idx int not null,
  match_id uuid references public.matches (id) on delete set null,
  entrant_a uuid, entrant_b uuid, winner_entrant uuid
);

alter table public.tournaments enable row level security;
alter table public.tournament_entrants enable row level security;
alter table public.bracket_matches enable row level security;

create policy "members read tournaments" on public.tournaments for select to authenticated using (is_club_member(club_id));
create policy "members write tournaments" on public.tournaments for insert to authenticated with check (is_club_member(club_id));
create policy "members update tournaments" on public.tournaments for update to authenticated using (is_club_member(club_id));

-- entrants + bracket cells inherit access from their tournament's club
create policy "members read entrants" on public.tournament_entrants for select to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members write entrants" on public.tournament_entrants for insert to authenticated
  with check (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members read bracket" on public.bracket_matches for select to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members write bracket" on public.bracket_matches for insert to authenticated
  with check (is_club_member((select club_id from tournaments where id = tournament_id)));
create policy "members update bracket" on public.bracket_matches for update to authenticated
  using (is_club_member((select club_id from tournaments where id = tournament_id)));