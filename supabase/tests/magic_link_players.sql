-- Local Postgres check for the magic-link migration. Not run by CI.
\set ON_ERROR_STOP on

drop schema if exists public cascade;
create schema public;
drop schema if exists auth cascade;
create schema auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

\i /Users/shcurtis/Documents/curt-tools/curt-ie-quiz/supabase/migrations/20261113000000_init.sql

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ann@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com');
insert into public.admins values ('33333333-3333-3333-3333-333333333333');
insert into public.players (name) values ('Ann'), ('Bob');

alter table public.players add column if not exists email text;
update public.players set email = 'ann@example.com' where name = 'Ann';
update public.players set email = 'bob@example.com' where name = 'Bob';

\i /Users/shcurtis/Documents/curt-tools/curt-ie-quiz/supabase/migrations/20261118000000_magic_link_players.sql

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"admin@example.com"}';
select public.publish_quiz(
  '529',
  'Week 529',
  'https://www.joe.ie/quiz/week-529',
  '[{"text":"q1"},{"text":"q2"},{"text":"q3"}]'::jsonb
) as quiz_id \gset
reset role;

\set ON_ERROR_STOP off

\echo === anon cannot call submit_score
set role anon;
select public.submit_score(:'quiz_id'::uuid, 2);
reset role;

\set ON_ERROR_STOP on

\echo === Ann can submit as herself
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"ann@example.com"}';
select * from public.current_player();
select public.submit_score(:'quiz_id'::uuid, 2);
\set ON_ERROR_STOP off
select public.submit_score(:'quiz_id'::uuid, 3);
\set ON_ERROR_STOP on
reset role;

\echo === Bob submits as Bob only
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com"}';
select public.submit_score(:'quiz_id'::uuid, 1);
reset role;

\echo === scores belong to session emails only
select p.name, s.score, s.total
from public.scores s
join public.players p on p.id = s.player_id
order by p.name;

\echo === anon cannot read players
\set ON_ERROR_STOP off
set role anon;
select email from public.players;
reset role;
