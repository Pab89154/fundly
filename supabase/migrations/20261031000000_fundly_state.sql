-- Fundly cloud state (service role only; browser never holds this key)

create table if not exists public.fundly_app_state (
  owner_email text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fundly_app_state enable row level security;

-- No policies for anon/authenticated — only service_role (bypasses RLS) may access.
drop policy if exists "deny_all_select" on public.fundly_app_state;
drop policy if exists "deny_all_write" on public.fundly_app_state;

comment on table public.fundly_app_state is 'Single-owner Fundly AppState JSON; owner_email = pmolinasamayoa@icloud.com';
