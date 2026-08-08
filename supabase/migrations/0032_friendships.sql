-- 0032_friendships.sql
-- A mutual, consenting connection between two real accounts, requested by
-- username and accepted before either side can see the other as a friend.

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- One relationship per pair regardless of direction: blocks A->B and B->A
-- both existing at once (simultaneous requests, or re-requesting someone
-- who already has a pending/accepted row the other way).
create unique index if not exists friendships_unordered_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy "friendships are readable by either party"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "a user can request a friendship as themselves"
  on public.friendships for insert to authenticated
  with check (
    auth.uid() = requester_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

create policy "either party can update status"
  on public.friendships for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "either party can delete the friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
