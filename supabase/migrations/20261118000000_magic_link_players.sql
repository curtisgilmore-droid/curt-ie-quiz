-- Magic-link players: email on players, session-bound submit_score, current_player RPC.
-- Run after 20261113000000_init.sql.
-- If you already have players, set every email in the Table editor before this migration finishes
-- (the migration adds the column first, then requires every row to have an email).

alter table public.players
  add column if not exists email text;

update public.players
set email = lower(btrim(email))
where email is not null and email <> lower(btrim(email));

do $$
begin
  if exists (
    select 1 from public.players where email is null or btrim(email) = ''
  ) then
    raise exception
      'Set an email on every players row in the Table editor, then re-run this migration.';
  end if;
end $$;

alter table public.players
  alter column email set not null;

alter table public.players
  drop constraint if exists players_email_format;

alter table public.players
  add constraint players_email_format check (
    email = lower(btrim(email)) and position('@' in email) > 1
  );

create unique index if not exists players_email_unique on public.players (email);

drop function if exists public.submit_score(uuid, uuid, integer);

create or replace function public.current_player()
returns table (id uuid, name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    return;
  end if;
  return query
  select p.id, p.name, p.email
  from public.players p
  where p.email = v_email;
end;
$$;

create or replace function public.submit_score(p_quiz_id uuid, p_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_is_current boolean;
  v_player_id uuid;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    raise exception 'not_authenticated';
  end if;

  select p.id into v_player_id from public.players p where p.email = v_email;
  if v_player_id is null then
    raise exception 'player_not_found';
  end if;

  select jsonb_array_length(questions), is_current
    into v_total, v_is_current
    from public.quizzes
    where id = p_quiz_id;

  if v_total is null then
    raise exception 'quiz_not_found';
  end if;
  if not v_is_current then
    raise exception 'quiz_not_current';
  end if;
  if p_score is null or p_score < 0 or p_score > v_total then
    raise exception 'invalid_score';
  end if;

  begin
    insert into public.scores (quiz_id, player_id, score, total)
    values (p_quiz_id, v_player_id, p_score, v_total);
  exception
    when unique_violation then
      raise exception 'already_submitted';
  end;
end;
$$;

drop policy if exists players_read on public.players;

create policy players_admin_read on public.players
  for select to authenticated using (public.is_admin());

create policy players_self_read on public.players
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

revoke execute on function public.submit_score(uuid, integer) from public, anon;
revoke execute on function public.current_player() from public, anon;
grant execute on function public.submit_score(uuid, integer) to authenticated;
grant execute on function public.current_player() to authenticated;
