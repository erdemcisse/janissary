-- Phase 6A identity links and moderation records. Server-only tables: no public policies.
alter table public.accounts add column if not exists auth_id uuid unique references auth.users(id) on delete set null;

create table if not exists public.auth_links (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  player_id bigint not null unique references public.accounts(player_id) on delete restrict,
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table if not exists public.auth_upgrade_requests (
  state_hash text primary key,
  player_id bigint not null references public.accounts(player_id) on delete cascade,
  email text not null check (email = lower(email)),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists public.player_mutes (
  player_id bigint primary key references public.accounts(player_id) on delete cascade,
  muted boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_reports (
  id bigint generated always as identity primary key,
  reporter_player_id bigint not null references public.accounts(player_id),
  message_id bigint not null,
  sender_player_id bigint not null references public.accounts(player_id),
  channel smallint not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.auth_links enable row level security;
alter table public.auth_upgrade_requests enable row level security;
alter table public.player_mutes enable row level security;
alter table public.chat_reports enable row level security;
