-- Run this in your Supabase SQL Editor

-- Custom pals created by users (random generated ones)
create table if not exists custom_pals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  pal_id text not null,
  name text not null,
  emoji text not null,
  persona text not null,
  color_index int not null default 0,
  created_at timestamptz default now()
);

-- Messages per user per pal
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  pal_id text not null,
  role text not null check (role in ('user','assistant')),
  content text,
  type text check (type in ('text','image')),
  caption text,
  svg_data text,
  msg_time text,
  created_at timestamptz default now()
);

-- User settings (API key stored encrypted per user)
create table if not exists user_settings (
  user_id uuid references auth.users on delete cascade primary key,
  api_key_hint text, -- last 4 chars only, for display
  updated_at timestamptz default now()
);

-- Row Level Security: users can only see their own data
alter table custom_pals enable row level security;
alter table messages enable row level security;
alter table user_settings enable row level security;

create policy "Users own their custom pals" on custom_pals
  for all using (auth.uid() = user_id);

create policy "Users own their messages" on messages
  for all using (auth.uid() = user_id);

create policy "Users own their settings" on user_settings
  for all using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists messages_user_pal on messages(user_id, pal_id, created_at);
create index if not exists custom_pals_user on custom_pals(user_id);
