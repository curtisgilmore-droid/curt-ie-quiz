-- CURT.ie Quiz schema: tables, leaderboard views, RPC functions and row-level security.
-- Run once in the Supabase SQL editor (or with the Supabase CLI).

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  week_id text not null unique check (btrim(week_id) <> ''),
  title text not null check (btrim(title) <> ''),
  source_url text not null,
  questions jsonb not null check (
    jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) > 0
  ),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index quizzes_single_current on public.quizzes (is_current) where is_current;

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  created_at timestamptz not null default now(),
  check (score <= total),
  unique (quiz_id, player_id)
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.submit_score(p_player_id uuid, p_quiz_id uuid, p_score integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_is_current boolean;
begin
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
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;
  if p_score is null or p_score < 0 or p_score > v_total then
    raise exception 'invalid_score';
  end if;

  begin
    insert into public.scores (quiz_id, player_id, score, total)
    values (p_quiz_id, p_player_id, p_score, v_total);
  exception
    when unique_violation then
      raise exception 'already_submitted';
  end;
end;
$$;

create function public.publish_quiz(
  p_week_id text,
  p_title text,
  p_source_url text,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  update public.quizzes set is_current = false where is_current;

  insert into public.quizzes (week_id, title, source_url, questions, is_current)
  values (p_week_id, p_title, p_source_url, p_questions, true)
  on conflict (week_id) do update
    set title = excluded.title,
        source_url = excluded.source_url,
        questions = excluded.questions,
        is_current = true
  returning id into v_id;

  return v_id;
end;
$$;

create view public.weekly_leaderboard as
select
  q.id as quiz_id,
  q.week_id,
  p.id as player_id,
  p.name as player_name,
  s.score,
  s.total,
  s.created_at
from public.scores s
join public.quizzes q on q.id = s.quiz_id
join public.players p on p.id = s.player_id;

create view public.all_time_leaderboard as
select
  p.id as player_id,
  p.name as player_name,
  sum(s.score)::integer as total_score,
  sum(s.total)::integer as total_possible,
  count(*)::integer as quizzes_played
from public.scores s
join public.players p on p.id = s.player_id
group by p.id, p.name;

alter table public.players enable row level security;
alter table public.quizzes enable row level security;
alter table public.scores enable row level security;
alter table public.admins enable row level security;

create policy players_read on public.players
  for select to anon, authenticated using (true);
create policy players_admin_write on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy quizzes_read on public.quizzes
  for select to anon, authenticated using (true);
create policy quizzes_admin_write on public.quizzes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy scores_admin_all on public.scores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.scores, public.admins from anon, authenticated;
grant select, insert, update, delete on public.scores to authenticated;
revoke insert, update, delete on public.players, public.quizzes from anon;

grant select on public.weekly_leaderboard, public.all_time_leaderboard to anon, authenticated;

revoke execute on function public.is_admin() from public;
revoke execute on function public.submit_score(uuid, uuid, integer) from public;
revoke execute on function public.publish_quiz(text, text, text, jsonb) from public, anon;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.submit_score(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.publish_quiz(text, text, text, jsonb) to authenticated;
