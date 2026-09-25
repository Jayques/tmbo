-- =====================================================================
--  TMBO: run the send-reminders Edge Function every 5 minutes.
--  BEFORE running: enable the "pg_cron" and "pg_net" extensions
--  (Supabase > Database > Extensions), then replace the two placeholders:
--    YOUR-PROJECT-REF  -> the part before .supabase.co in your Project URL
--    YOUR-CRON-SECRET  -> the same value you saved as the CRON_SECRET secret
-- =====================================================================

-- Remove an older copy of the job if you are re-running this file
select cron.unschedule(jobid) from cron.job where jobname = 'tmbo-send-reminders';

select cron.schedule(
  'tmbo-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://zfhupshmsajmcqyqzuul.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', 'A_zLIrNg8tLKrFrYMkfCsGTalZsV82bV'),
    body    := '{}'::jsonb
  );
  $$
);

-- Check it's scheduled:          select * from cron.job;
-- See recent runs:               select * from cron.job_run_details order by start_time desc limit 10;
-- See the function's responses:  select * from net._http_response order by created desc limit 10;
