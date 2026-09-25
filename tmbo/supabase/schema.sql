-- =====================================================================
--  TMBO (There Must Be Order) database schema for Supabase
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  It is safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 140),
  notes         text,
  tier          smallint not null default 2 check (tier between 1 and 4),        -- 1 = most important
  repeat        text not null default 'once' check (repeat in ('once','daily','weekdays','custom')),
  repeat_days   smallint[] not null default '{}',                                -- 0=Sun ... 6=Sat
  task_date     date not null,               -- one-time: the day it is on | repeating: start date
  until_date    date,                        -- optional last day for repeating tasks (event prep)
  original_date date not null,               -- the day it was first planned for
  carry_over    boolean not null default true,
  carried_days  integer not null default 0,
  done          boolean not null default false,  -- one-time tasks only
  done_on       date,
  remind_at     time,                        -- optional reminder time on the task's day
  event_id      uuid,                        -- set when this is an event's "Prepare: ..." task
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);

-- Daily check-offs for repeating tasks (also powers streaks)
create table if not exists public.task_completions (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  completed_on date not null,
  primary key (task_id, completed_on)
);

-- ---------------------------------------------------------------------
-- EVENTS (tests, interviews, deadlines, other)
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  type         text not null default 'test' check (type in ('test','interview','deadline','other')),
  event_date   date not null,
  event_time   time,
  notes        text,
  remind_days  smallint[] not null default '{7,3,1,0}',   -- days before the event to remind
  prep_task    boolean not null default true,
  prep_task_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_user_date_idx on public.events (user_id, event_date);

-- ---------------------------------------------------------------------
-- SETTINGS: appearance, home screen, notifications (one row per user)
-- ---------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name    text,
  timezone        text not null default 'America/New_York',
  accent          text not null default '#4f46e5',
  mode            text not null default 'system' check (mode in ('light','dark','system')),
  text_size       smallint not null default 1 check (text_size between 0 and 3),
  template        text not null default 'classic' check (template in ('classic','compact','planner')),
  tier_labels     jsonb not null default '["Must do","Should do","Could do","Nice to have"]',
  default_carry   boolean not null default true,
  show_done       boolean not null default true,
  home_scene      text not null default 'summit' check (home_scene in ('summit','sunrise','steps','waves','photo')),
  home_palette    text not null default 'midnight',
  home_font       text not null default 'bold' check (home_font in ('bold','classic','modern')),
  home_photo_path text,
  quote_id        text not null default 'q0',
  random_quote    boolean not null default false,
  notify_enabled  boolean not null default false,
  notify_time     time not null default '09:00',
  notify_summary  boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- Quotes people write themselves (built-in quotes live in the app code)
create table if not exists public.custom_quotes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 160),
  author     text,
  created_at timestamptz not null default now()
);

-- Study timer sessions
create table if not exists public.study_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject    text,
  minutes    integer not null check (minutes > 0),
  studied_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PUSH NOTIFICATIONS
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Written only by the send-reminders Edge Function (service role), so the
-- same reminder is never sent twice. No policies = no access from the app.
create table if not exists public.sent_reminders (
  key     text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY: each user can only see and change their own rows
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tasks','task_completions','events','user_settings',
                           'custom_quotes','study_sessions','push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.sent_reminders enable row level security;

-- ---------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.user_settings;
create trigger settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- REALTIME: live sync between a person's devices
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tasks','task_completions','events','user_settings','custom_quotes']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- STORAGE: private bucket for home-screen photos
-- Each user can only read/write files inside a folder named with their user id.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('home-photos', 'home-photos', false)
on conflict (id) do nothing;

drop policy if exists "tmbo own photos" on storage.objects;
create policy "tmbo own photos" on storage.objects for all to authenticated
  using      (bucket_id = 'home-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'home-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Done! You should see "Success. No rows returned".
