-- Fundly Coach chat threads (service role only; browser never holds this key)

create table if not exists public.fundly_coach_chats (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null default 'pmolinasamayoa@icloud.com',
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fundly_coach_chats_owner_updated_idx
  on public.fundly_coach_chats (owner_email, updated_at desc);

create table if not exists public.fundly_coach_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.fundly_coach_chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  pending_action jsonb,
  seq int not null,
  created_at timestamptz not null default now(),
  unique (chat_id, seq)
);

create index if not exists fundly_coach_messages_chat_seq_idx
  on public.fundly_coach_messages (chat_id, seq);

alter table public.fundly_coach_chats enable row level security;
alter table public.fundly_coach_messages enable row level security;

-- No policies for anon/authenticated — only service_role (bypasses RLS) may access.

comment on table public.fundly_coach_chats is 'Fundly Coach conversation threads; owner_email = pmolinasamayoa@icloud.com';
comment on table public.fundly_coach_messages is 'Ordered messages within a Fundly Coach chat';
