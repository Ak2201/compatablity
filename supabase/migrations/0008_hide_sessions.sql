-- Remove a session from your own dashboard. Only your view changes: the session, the partner's view,
-- and all answers stay exactly as they are. Stored per person, so it follows you to any browser.
-- Run after 0007_pairing_rule.sql. Idempotent.

create table if not exists public.session_hidden (
  session_code text not null references public.sessions(code) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  hidden_at    timestamptz not null default now(),
  primary key (session_code, user_id)
);

alter table public.session_hidden enable row level security;

drop policy if exists hidden_select_own on public.session_hidden;
create policy hidden_select_own on public.session_hidden
  for select to authenticated using (user_id = auth.uid());

-- You can only hide a session you are a member of, and only for yourself.
drop policy if exists hidden_insert_own on public.session_hidden;
create policy hidden_insert_own on public.session_hidden
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_session_member(session_code));

-- Undo: show it again on your dashboard.
drop policy if exists hidden_delete_own on public.session_hidden;
create policy hidden_delete_own on public.session_hidden
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.session_hidden from anon, authenticated;
grant select, insert, delete on public.session_hidden to authenticated;
