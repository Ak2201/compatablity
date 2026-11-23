-- Pairing rule: a couple session needs one male and one female. Friendship sessions accept any two people.
-- Sessions with no recorded creator gender (created before accounts) are not checked.
-- Run after 0006_session_kind.sql. Idempotent.

create or replace function public.join_session(p_code text, p_name text, p_gender text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if char_length(trim(p_name)) not between 1 and 30 then raise exception 'bad_name'; end if;
  if p_gender not in ('male', 'female') then raise exception 'bad_gender'; end if;

  select * into s from public.sessions where code = p_code for update;
  if not found then raise exception 'not_found'; end if;
  if s.member_a = auth.uid() or s.member_b = auth.uid() then return 'already'; end if;
  if s.member_b is not null then raise exception 'full'; end if;

  -- Couple sessions: the second person must be the other gender.
  if s.kind = 'couple' and s.member_a_gender is not null and s.member_a_gender = p_gender then
    raise exception 'same_gender';
  end if;

  update public.sessions
     set member_b = auth.uid(),
         member_b_name = trim(p_name),
         member_b_gender = p_gender,
         status = 'both_joined'
   where code = p_code;
  return 'joined';
end;
$$;

revoke execute on function public.join_session(text, text, text) from public, anon;
grant  execute on function public.join_session(text, text, text) to authenticated;
