-- Track whether the user has explicitly chosen their display name. The
-- handle_new_user trigger prefills display_name from the auth provider, so the
-- value alone cannot tell us whether the user ever picked it.
alter table public.profiles
  add column if not exists display_name_set boolean not null default false;

-- Existing users already have a usable name; do not re-prompt them.
update public.profiles set display_name_set = true where display_name <> '';
