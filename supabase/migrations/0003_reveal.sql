-- Reveal: once both members have locked in, the session moves to 'revealed' (not 'locked'),
-- which lets the RLS policy answers_select show each person the other's answers.
-- Run after 0002_answers_submit.sql. Safe to re-run (create or replace).

-- Submit: saves the caller's final answers and locks their row. When both members have locked,
-- the session moves to 'revealed'.
create or replace function public.submit_answers(p_code text, p_answers jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.sessions%rowtype;
  v_locked boolean;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  if octet_length(p_answers::text) > 60000 then raise exception 'too_large'; end if;

  select * into s from public.sessions where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if s.member_a <> auth.uid() and s.member_b is distinct from auth.uid() then
    raise exception 'not_member';
  end if;
  if s.member_b is null then raise exception 'not_full'; end if;

  select locked into v_locked from public.answers
   where session_code = p_code and user_id = auth.uid();
  if v_locked then raise exception 'already_locked'; end if;

  insert into public.answers (session_code, user_id, answers, locked, updated_at)
  values (p_code, auth.uid(), p_answers, true, now())
  on conflict (session_code, user_id)
  do update set answers = excluded.answers, locked = true, updated_at = now();

  if (select count(*) from public.answers a
       where a.session_code = p_code and a.locked) = 2
     and s.status in ('both_joined', 'answering', 'locked') then
    update public.sessions set status = 'revealed' where code = p_code;
    return 'revealed';
  end if;
  return 'submitted';
end;
$$;

revoke execute on function public.submit_answers(text, jsonb) from public, anon;
grant  execute on function public.submit_answers(text, jsonb) to authenticated;

-- Helper: true when the session's answers are visible to members (status = 'revealed').
-- Available for use; not referenced by any policy yet.
create or replace function public.session_answers_visible(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
     where s.code = p_code and s.status = 'revealed'
  );
$$;

revoke execute on function public.session_answers_visible(text) from public, anon;
grant  execute on function public.session_answers_visible(text) to authenticated;
