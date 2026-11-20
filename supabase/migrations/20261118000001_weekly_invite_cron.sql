-- Friday 11:00 Europe/Dublin invite. Requires Vault secrets project_url and service_role_key,
-- and the send-weekly-invite Edge Function deployed with verify_jwt disabled.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'curt-ie-quiz-weekly-invite';

select cron.schedule(
  'curt-ie-quiz-weekly-invite',
  '0 11 * * 5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-weekly-invite',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $$
);

update cron.job
set timezone = 'Europe/Dublin'
where jobname = 'curt-ie-quiz-weekly-invite';
