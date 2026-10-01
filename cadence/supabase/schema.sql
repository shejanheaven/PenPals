-- Cadence cloud schema.
-- Supabase → SQL Editor → paste this file → Run. Safe to run more than once.

-- One row per person: their whole planner, merged entity-by-entity by the app.
create table if not exists cadence_state (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Devices that asked for push reminders.
create table if not exists cadence_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists cadence_push_subscriptions_user on cadence_push_subscriptions (user_id);

-- Upcoming reminders, written by the app, sent by the send-reminders function.
create table if not exists cadence_reminders (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  fire_at timestamptz not null,
  title text not null,
  body text,
  tag text,
  url text,
  data jsonb,
  sent_at timestamptz,
  primary key (user_id, id)
);
create index if not exists cadence_reminders_due on cadence_reminders (fire_at) where sent_at is null;

-- Things captured from texts, email and automations, waiting for the app to pick up.
create table if not exists cadence_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null check (char_length(text) <= 4000),
  source text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cadence_inbox_user on cadence_inbox (user_id, created_at);

-- Each person's private webhook token.
create table if not exists cadence_capture_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now()
);

-- ── Row level security: everyone sees only their own rows ──────────────────
alter table cadence_state enable row level security;
alter table cadence_push_subscriptions enable row level security;
alter table cadence_reminders enable row level security;
alter table cadence_inbox enable row level security;
alter table cadence_capture_tokens enable row level security;

drop policy if exists "own state" on cadence_state;
create policy "own state" on cadence_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own subscriptions" on cadence_push_subscriptions;
create policy "own subscriptions" on cadence_push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own reminders" on cadence_reminders;
create policy "own reminders" on cadence_reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own inbox" on cadence_inbox;
create policy "own inbox" on cadence_inbox for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own token" on cadence_capture_tokens;
create policy "own token" on cadence_capture_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Claim reminders that are due, exactly once (used by send-reminders) ─────
create or replace function cadence_claim_due_reminders(max_rows int default 500)
returns setof cadence_reminders
language sql
security definer
set search_path = public
as $$
  update cadence_reminders r
     set sent_at = now()
   where (r.user_id, r.id) in (
     select user_id, id
       from cadence_reminders
      where sent_at is null
        and fire_at <= now()
        and fire_at > now() - interval '15 minutes'
      order by fire_at
      limit max_rows
      for update skip locked
   )
  returning r.*;
$$;

revoke all on function cadence_claim_due_reminders(int) from public, anon, authenticated;
