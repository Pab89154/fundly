-- Manual chat order for Fundly Coach sidebar

alter table public.fundly_coach_chats
  add column if not exists sort_order int not null default 0;

-- Existing rows: newest first (higher updated_at → lower sort_order)
with ranked as (
  select id, row_number() over (order by updated_at desc) - 1 as rn
  from public.fundly_coach_chats
)
update public.fundly_coach_chats c
set sort_order = ranked.rn
from ranked
where c.id = ranked.id;

create index if not exists fundly_coach_chats_owner_sort_idx
  on public.fundly_coach_chats (owner_email, sort_order asc, updated_at desc);
