-- Migration: create user_profiles table and supporting RLS for Supabase auth
-- Run this in Supabase SQL editor or via drizzle migration runner.

-- Helper to keep updated_at fresh
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- User profiles table (mirrors auth.users with display metadata)
create table if not exists public.user_profiles (
  id uuid primary key references auth.users,
  email text unique not null,
  display_name text not null,
  tier text not null default 'Pro',
  join_date timestamptz not null default now(),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to update updated_at on write
drop trigger if exists user_profiles_updated on public.user_profiles;
create trigger user_profiles_updated
before update on public.user_profiles
for each row execute procedure public.trigger_set_timestamp();

-- Row Level Security: users can manage only their own profile
alter table public.user_profiles enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can manage own profile'
  ) then
    create policy "Users can manage own profile"
    on public.user_profiles
    for all
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;
end$$;
