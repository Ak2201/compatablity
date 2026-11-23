-- Bring older two-person sessions into the new home. Adds rows only; nothing is deleted or changed in
-- sessions, answers, or session_hidden. Idempotent: re-running adds nothing new.
-- Rules:
--   * Every older session with two people becomes a connection with the same code.
--   * Completed sessions (status 'revealed') keep sharing on for both people, because they already saw each
--     other's results. Unfinished sessions start with sharing off.
--   * Each person's latest locked answers for that kind become their profile answers, only where they have none.
--   * Names and genders come from the old session records, only where a profile does not exist yet and the
--     gender is known (profiles require male or female).
-- Run after 0010_features.sql.

insert into public.connections (code, user_a, user_b, share_a, share_b, created_at, expires_at)
select
  s.code,
  s.member_a,
  s.member_b,
  s.status = 'revealed',
  s.status = 'revealed',
  s.created_at,
  'infinity'::timestamptz
from public.sessions s
where s.member_b is not null
  and s.member_a <> s.member_b
  and not exists (select 1 from public.connections c where c.code = s.code);

insert into public.profile_answers (user_id, bank, answers, updated_at)
select distinct on (a.user_id, s.kind)
  a.user_id,
  s.kind,
  a.answers,
  a.updated_at
from public.answers a
join public.sessions s on s.code = a.session_code
where a.locked
  and s.kind in ('couple', 'friendship')
  and jsonb_typeof(a.answers) = 'object'
order by a.user_id, s.kind, a.updated_at desc
on conflict (user_id, bank) do nothing;

insert into public.profiles (user_id, display_name, gender)
select distinct on (x.uid) x.uid, x.name, x.gender
from (
  select s.member_a as uid, s.member_a_name as name, s.member_a_gender as gender, s.created_at
  from public.sessions s
  union all
  select s.member_b, s.member_b_name, s.member_b_gender, s.created_at
  from public.sessions s
  where s.member_b is not null
) x
where x.gender in ('male', 'female')
  and x.name is not null
  and char_length(trim(x.name)) between 1 and 30
  and exists (select 1 from auth.users u where u.id = x.uid)
order by x.uid, x.created_at desc
on conflict (user_id) do nothing;
