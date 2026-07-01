-- Run this in Supabase → SQL Editor
-- Fixes: "Failed to create user: Database error creating new user"
--
-- Cause: the signup trigger could not insert into profiles (RLS / search_path).

-- 1. Backfill any auth users missing a profile row
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email);

-- 2. Fix trigger function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Allow Auth service to create profile rows
drop policy if exists "Auth admin can insert profiles" on profiles;
create policy "Auth admin can insert profiles"
  on profiles for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);
