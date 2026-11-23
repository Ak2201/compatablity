-- Fourth answer bank: 'wellbeing', private to its owner. Run after 0012_self_bank.sql. Idempotent.
-- Only profile_answers' bank check and one helper function change. No rows are changed or deleted.
--
-- Wellbeing is never shared:
--   * profile_answers accepts 'wellbeing', so the owner can save it.
--   * connection_answers and save_snapshot keep their 0012 list ('couple', 'friendship', 'self'),
--     so 'wellbeing' is refused with 'bad_bank' in both. Neither function is changed here.
--   * profile_snapshots does NOT accept 'wellbeing'; it is not part of the check.
--   * Reads: profile_answers RLS (profile_answers_select_own, user_id = auth.uid()) already limits
--     every read to the owner. No other user can see a wellbeing row, so no extra policy is needed.

-- ---------- bank check on profile_answers: accept 'wellbeing' too ----------
-- Same approach as 0012: drop the existing bank check (found by its definition), then add it back
-- under a fixed name. Re-running replaces it with the same definition.

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid = 'public.profile_answers'::regclass
      and pg_get_constraintdef(c.oid) like '%couple%'
      and pg_get_constraintdef(c.oid) like '%bank%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$$;

alter table public.profile_answers
  add constraint profile_answers_bank_check check (bank in ('couple', 'friendship', 'self', 'wellbeing'));

-- ---------- helper: the caller's own wellbeing answers ----------
-- security invoker, so the RLS select policy on profile_answers applies. The filter on auth.uid()
-- means it returns the caller's row only: an empty object when there is none, and never another user's row.

create or replace function public.my_wellbeing()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select pa.answers from public.profile_answers pa
    where pa.user_id = auth.uid() and pa.bank = 'wellbeing'
  ), '{}'::jsonb);
$$;

revoke execute on function public.my_wellbeing() from public, anon;
grant  execute on function public.my_wellbeing() to authenticated;
