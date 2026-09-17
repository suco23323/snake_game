-- ============================================================================
-- Snake Game - Supabase initialization
-- ============================================================================
-- Run this script in the Supabase SQL Editor (or with psql) as a role that can
-- manage tables in the public schema and triggers on auth.users.
--
-- Objects:
--   1. public.profiles      - public player profile, 1:1 with auth.users
--   2. public.game_scores   - one row per submitted game
--   3. public.leaderboard   - best score per player, ranked view
--   4. submit_score(...)    - idempotent score submission RPC
--
-- The script is intended to be safe to run more than once. It recreates
-- policies, triggers, the leaderboard view and the RPC, but does not delete
-- existing profile or score data.
-- ============================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null,
  display_name text,
  email citext,
  email_visibility text not null default 'masked',
  avatar_url text,
  leaderboard_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_key unique (username),
  constraint profiles_email_key unique (email),
  constraint profiles_username_length_check
    check (char_length(username::text) between 3 and 30),
  constraint profiles_display_name_length_check
    check (display_name is null or char_length(display_name) between 1 and 50),
  constraint profiles_email_visibility_check
    check (email_visibility in ('private', 'masked', 'public'))
);

comment on table public.profiles is
  'Player profile data used by authentication and the leaderboard.';
comment on column public.profiles.email is
  'Private copy of auth.users.email. The leaderboard must only expose a masked value.';

create index if not exists profiles_email_idx
  on public.profiles (email);

-- ----------------------------------------------------------------------------
-- Game scores
-- ----------------------------------------------------------------------------
create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  snake_length integer not null default 1,
  duration_ms integer not null default 0,
  foods_eaten integer not null default 0,
  game_mode text not null default 'classic',
  game_version text not null default '1.0',
  client_game_id uuid not null,
  is_valid boolean not null default true,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint game_scores_score_check check (score >= 0),
  constraint game_scores_snake_length_check check (snake_length >= 1),
  constraint game_scores_duration_check check (duration_ms >= 0),
  constraint game_scores_foods_eaten_check check (foods_eaten >= 0),
  constraint game_scores_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint game_scores_user_game_key unique (user_id, client_game_id)
);

comment on table public.game_scores is
  'Immutable score records submitted after each game.';
comment on column public.game_scores.client_game_id is
  'UUID generated once per game and used to make score submission idempotent.';

create index if not exists game_scores_rank_idx
  on public.game_scores (score desc, played_at asc)
  where is_valid = true;

create index if not exists game_scores_user_score_idx
  on public.game_scores (user_id, score desc, played_at asc);

create index if not exists game_scores_mode_rank_idx
  on public.game_scores (game_mode, score desc, played_at asc)
  where is_valid = true;

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.snakegame_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists snakegame_profiles_updated_at on public.profiles;
create trigger snakegame_profiles_updated_at
before update on public.profiles
for each row
execute function public.snakegame_set_updated_at();

-- ----------------------------------------------------------------------------
-- Create a profile automatically after a Supabase Auth user is created.
-- Pass username and display_name through signUp options.data:
--   { data: { username: 'player-one', display_name: 'Player One' } }
-- ----------------------------------------------------------------------------
create or replace function public.snakegame_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display_name text;
  v_fallback_username text;
begin
  v_fallback_username :=
    'player_' || left(replace(new.id::text, '-', ''), 12);

  v_username := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'username', '')),
    ''
  );

  if v_username is null then
    v_username := v_fallback_username;
  end if;

  v_display_name := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')),
    ''
  );

  if v_display_name is null then
    v_display_name := v_username;
  end if;

  begin
    insert into public.profiles (id, username, display_name, email)
    values (new.id, v_username, v_display_name, new.email)
    on conflict (id) do update
      set email = excluded.email;
  exception
    when unique_violation then
      -- A username can already be taken when Auth metadata is not validated
      -- before sign-up. Fall back to a deterministic, unique player name.
      v_username := v_fallback_username;
      v_display_name := v_fallback_username;

      insert into public.profiles (id, username, display_name, email)
      values (new.id, v_username, v_display_name, new.email)
      on conflict (id) do update
        set email = excluded.email;
  end;

  return new;
end;
$$;

drop trigger if exists snakegame_on_auth_user_created on auth.users;
create trigger snakegame_on_auth_user_created
after insert on auth.users
for each row
execute function public.snakegame_handle_new_user();

-- Keep the private profile email in sync if the Auth email changes.
create or replace function public.snakegame_sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists snakegame_on_auth_user_email_updated on auth.users;
create trigger snakegame_on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.snakegame_sync_user_email();

-- ----------------------------------------------------------------------------
-- Idempotent score submission RPC.
--
-- Example from the React client:
--   const { data, error } = await supabase.rpc('snakegame_submit_score', {
--     p_score: score,
--     p_client_game_id: gameId, // crypto.randomUUID() at game start
--     p_snake_length: snake.length,
--     p_duration_ms: durationMs,
--     p_foods_eaten: foodsEaten,
--     p_game_mode: 'classic',
--     p_game_version: '1.0',
--     p_metadata: {}
--   });
-- ----------------------------------------------------------------------------
create or replace function public.snakegame_submit_score(
  p_score integer,
  p_client_game_id uuid,
  p_snake_length integer default 1,
  p_duration_ms integer default 0,
  p_foods_eaten integer default 0,
  p_game_mode text default 'classic',
  p_game_version text default '1.0',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_score_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_client_game_id is null then
    raise exception 'p_client_game_id is required' using errcode = '22004';
  end if;

  if p_score is null or p_score < 0 then
    raise exception 'p_score must be greater than or equal to zero'
      using errcode = '22023';
  end if;

  if p_snake_length is null or p_snake_length < 1 then
    raise exception 'p_snake_length must be at least one'
      using errcode = '22023';
  end if;

  if p_duration_ms is null or p_duration_ms < 0 then
    raise exception 'p_duration_ms must be greater than or equal to zero'
      using errcode = '22023';
  end if;

  if p_foods_eaten is null or p_foods_eaten < 0 then
    raise exception 'p_foods_eaten must be greater than or equal to zero'
      using errcode = '22023';
  end if;

  if p_metadata is not null
     and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'p_metadata must be a JSON object'
      using errcode = '22023';
  end if;

  -- Return the existing row for a retried request instead of creating a
  -- duplicate score. The client should reuse the same game UUID on retry.
  select gs.id
  into v_score_id
  from public.game_scores as gs
  where gs.user_id = v_user_id
    and gs.client_game_id = p_client_game_id;

  if v_score_id is not null then
    return v_score_id;
  end if;

  insert into public.game_scores (
    user_id,
    score,
    snake_length,
    duration_ms,
    foods_eaten,
    game_mode,
    game_version,
    client_game_id,
    metadata
  )
  values (
    v_user_id,
    p_score,
    p_snake_length,
    p_duration_ms,
    p_foods_eaten,
    coalesce(nullif(btrim(p_game_mode), ''), 'classic'),
    coalesce(nullif(btrim(p_game_version), ''), '1.0'),
    p_client_game_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_score_id;

  return v_score_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Public leaderboard view: one row per player, ranked by cumulative score.
-- Raw email is never returned. Masked emails look like: a***@example.com.
-- ----------------------------------------------------------------------------
drop view if exists public.leaderboard;

create view public.leaderboard
with (security_barrier = true)
as
with valid_scores as (
  select
    gs.id,
    gs.user_id,
    gs.score,
    gs.snake_length,
    gs.played_at
  from public.game_scores as gs
  where gs.is_valid = true
),
ranked_scores as (
  select
    vs.*,
    row_number() over (
      partition by vs.user_id
      order by vs.score desc, vs.played_at asc, vs.id asc
    ) as score_position
  from valid_scores as vs
),
best_scores as (
  select
    rs.id,
    rs.user_id,
    rs.score,
    rs.snake_length,
    rs.played_at
  from ranked_scores as rs
  where rs.score_position = 1
),
user_stats as (
  select
    vs.user_id,
    count(*)::bigint as games_played,
    sum(vs.score)::bigint as total_score,
    max(vs.played_at) as last_played_at
  from valid_scores as vs
  group by vs.user_id
)
select
  rank() over (
    order by us.total_score desc, bs.score desc, us.last_played_at asc, p.id
  ) as rank,
  p.id as user_id,
  p.username::text as username,
  coalesce(nullif(btrim(p.display_name), ''), p.username::text) as display_name,
  case
    when p.email is null then null
    when p.email_visibility = 'public' then p.email::text
    when p.email_visibility = 'masked' then
      regexp_replace(
        p.email::text,
        '^(.)[^@]*(@.*)$',
        '\1***\2'
      )
    else null
  end as email_display,
  bs.score as best_score,
  bs.played_at as best_score_at,
  bs.snake_length as best_snake_length,
  us.games_played,
  us.total_score
from best_scores as bs
join public.profiles as p
  on p.id = bs.user_id
join user_stats as us
  on us.user_id = bs.user_id
where p.leaderboard_opt_in = true;

comment on view public.leaderboard is
  'Players ranked by cumulative score. Email addresses are masked by default.';

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.game_scores enable row level security;

-- Profiles: each user can read and edit only their own profile.
drop policy if exists "snakegame profiles select own" on public.profiles;
create policy "snakegame profiles select own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "snakegame profiles insert self" on public.profiles;
create policy "snakegame profiles insert self"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "snakegame profiles update own" on public.profiles;
create policy "snakegame profiles update own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Game scores: users can read their own raw rows and insert their own scores.
-- The public leaderboard reads through the view above.
drop policy if exists "snakegame scores select own" on public.game_scores;
create policy "snakegame scores select own"
on public.game_scores
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "snakegame scores insert own" on public.game_scores;
create policy "snakegame scores insert own"
on public.game_scores
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- No update or delete policy: score rows are intended to be immutable.

-- ----------------------------------------------------------------------------
-- Privileges
-- Direct writes to game_scores are intentionally not granted. Use the RPC so
-- client_game_id idempotency is applied consistently.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.game_scores from anon, authenticated;
revoke all on table public.leaderboard from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (
  username,
  display_name,
  avatar_url,
  email_visibility,
  leaderboard_opt_in
) on table public.profiles to authenticated;

grant select on table public.game_scores to authenticated;
grant select on table public.leaderboard to anon, authenticated;

revoke all on function public.snakegame_submit_score(
  integer,
  uuid,
  integer,
  integer,
  integer,
  text,
  text,
  jsonb
) from public;

grant execute on function public.snakegame_submit_score(
  integer,
  uuid,
  integer,
  integer,
  integer,
  text,
  text,
  jsonb
) to authenticated;

select 'snakegame database initialization complete' as status;

