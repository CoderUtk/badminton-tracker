-- Dummy club players for testing tournaments, sessions, and brackets.
--
-- These are GUEST players (profile_id = null) — they need no accounts and are
-- scored like anyone else. Run in the Supabase SQL Editor.
--
-- Usage:
--   1. Sign in to the app and create a club (so you are its owner).
--   2. Find the club id:  select id, name from public.clubs;
--   3. Paste that id below, then run.

do $$
declare
  v_club_id uuid := 'PASTE-YOUR-CLUB-ID-HERE';  -- <<< replace
  v_names text[] := array[
    'Aarav Sharma','Vihaan Patel','Ananya Rao','Diya Nair','Kabir Singh','Ishaan Gupta',
    'Meera Iyer','Rohan Das','Saanvi Joshi','Arjun Reddy','Priya Menon','Karan Malhotra',
    'Neha Kapoor','Aditya Bose','Riya Chatterjee','Vikram Pillai'
  ];
  v_name text;
begin
  if v_club_id is null then
    raise exception 'Set v_club_id first';
  end if;

  foreach v_name in array v_names loop
    insert into public.club_players (club_id, profile_id, name)
    values (v_club_id, null, v_name);
  end loop;

  raise notice 'Inserted % guest players into club %', array_length(v_names, 1), v_club_id;
end $$;

-- Verify:
--   select name, profile_id from public.club_players where club_id = 'YOUR-CLUB-ID' order by name;
--
-- Clean up (removes ONLY guests, keeps real member-linked players):
--   delete from public.club_players where club_id = 'YOUR-CLUB-ID' and profile_id is null;
