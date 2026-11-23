-- Let the creator answer and submit before the partner joins.
-- The reveal still needs both people to have submitted. Run after 0003_reveal.sql. Safe to re-run.

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

  select locked into v_locked from public.answers
   where session_code = p_code and user_id = auth.uid();
  if v_locked then raise exception 'already_locked'; end if;

  insert into public.answers (session_code, user_id, answers, locked, updated_at)
  values (p_code, auth.uid(), p_answers, true, now())
  on conflict (session_code, user_id)
  do update set answers = excluded.answers, locked = true, updated_at = now();

  -- Reveal only when both members have submitted. A partner who has not joined yet cannot have submitted.
  if s.member_b is not null
     and (select count(*) from public.answers a
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
