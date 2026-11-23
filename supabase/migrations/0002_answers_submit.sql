-- Answers: larger size cap and a submit (lock) function.
-- Run after 0001_couples_init.sql.

-- Reflections are free text (up to 1000 characters each, 10 of them), so 20 KB was too tight.
alter table public.answers drop constraint if exists answers_answers_check;
alter table public.answers add constraint answers_answers_check
  check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 60000);

-- Submit: saves the caller's final answers and locks their row. Once both members have locked,
-- the session moves to 'locked'. Partner answers stay hidden until a later step sets 'revealed'.
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
     and s.status in ('both_joined', 'answering') then
    update public.sessions set status = 'locked' where code = p_code;
    return 'locked';
  end if;
  return 'submitted';
end;
$$;

revoke execute on function public.submit_answers(text, jsonb) from public, anon;
grant  execute on function public.submit_answers(text, jsonb) to authenticated;
