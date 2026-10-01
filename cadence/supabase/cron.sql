-- Runs the push sender every minute. Run this AFTER deploying the
-- send-reminders function, replacing both placeholders:
--   <PROJECT_REF>  your project ref (the subdomain of your Supabase URL)
--   <CRON_SECRET>  the same random string you set as the CRON_SECRET secret
--
-- Needs the pg_cron and pg_net extensions (Database → Extensions).

select cron.unschedule('cadence-send-reminders')
where exists (select 1 from cron.job where jobname = 'cadence-send-reminders');

select cron.schedule(
  'cadence-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
