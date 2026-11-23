-- Third answer bank: 'self' (alongside 'couple' and 'friendship').
-- Run after 0011_import_sessions.sql. Idempotent.
-- Only constraints and two functions change. No rows are changed or deleted.

-- ---------- bank check constraints: accept 'self' too ----------
-- Find the existing bank check on each table by its definition (it mentions 'couple'), drop it, and add
-- the new one under a fixed name. Re-running finds the constraint already in place and replaces it with the
-- same definition.

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.profile_answers'::regclass, 'public.profile_snapshots'::regclass)
      and pg_get_constraintdef(c.oid) like '%couple%'
      and pg_get_constraintdef(c.oid) like '%bank%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$$;

alter table public.profile_answers
  add constraint profile_answers_bank_check check (bank in ('couple', 'friendship', 'self'));

alter table public.profile_snapshots
  add constraint profile_snapshots_bank_check check (bank in ('couple', 'friendship', 'self'));

-- ---------- RPC: read both sides' answers for one bank, only when both have shared (logged) ----------
-- Volatile on purpose: it writes an 'answers_viewed' event.

create or replace function public.connection_answers(p_id uuid, p_bank text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c       public.connections%rowtype;
  v_other uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_bank not in ('couple', 'friendship', 'self') then raise exception 'bad_bank'; end if;

  select * into c from public.connections where id = p_id;
  if not found then raise exception 'not_member'; end if;
  if c.user_a is distinct from auth.uid() and c.user_b is distinct from auth.uid() then
    raise exception 'not_member';
  end if;

  if c.user_b is null or not c.share_a or not c.share_b then
    raise exception 'not_shared';
  end if;

  v_other := case when c.user_a = auth.uid() then c.user_b else c.user_a end;

  insert into public.share_events (connection_id, actor, event)
  values (p_id, auth.uid(), 'answers_viewed');

  return jsonb_build_object(
    'mine', coalesce((
      select pa.answers from public.profile_answers pa
      where pa.user_id = auth.uid() and pa.bank = p_bank
    ), '{}'::jsonb),
    'theirs', coalesce((
      select pa.answers from public.profile_answers pa
      where pa.user_id = v_other and pa.bank = p_bank
    ), '{}'::jsonb)
  );
end;
$$;

-- ---------- RPC: snapshot your current answers for one bank (private to you) ----------

create or replace function public.save_snapshot(p_bank text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers jsonb;
  v_label   text := nullif(trim(p_label), '');
  v_id      uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_bank not in ('couple', 'friendship', 'self') then raise exception 'bad_bank'; end if;
  if v_label is not null and char_length(v_label) > 60 then raise exception 'bad_label'; end if;

  select pa.answers into v_answers
  from public.profile_answers pa
  where pa.user_id = auth.uid() and pa.bank = p_bank;

  if v_answers is null or v_answers = '{}'::jsonb then raise exception 'empty'; end if;

  insert into public.profile_snapshots (user_id, bank, answers, label)
  values (auth.uid(), p_bank, v_answers, v_label)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- grants on functions (same as 0010; re-stated so this file is complete on its own) ----------

revoke execute on function public.connection_answers(uuid, text) from public, anon;
revoke execute on function public.save_snapshot(text, text)      from public, anon;
grant  execute on function public.connection_answers(uuid, text) to authenticated;
grant  execute on function public.save_snapshot(text, text)      to authenticated;
