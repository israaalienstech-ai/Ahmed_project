-- Run daily-expiry-alerts Edge Function automatically every 2 hours (0 */2 * * *)
-- Execute this once in Supabase SQL Editor after deploying daily-expiry-alerts.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove previous schedule with the same name if it exists
select cron.unschedule('al-muhallab-expiry-alerts-every-2-hours')
where exists (
  select 1 from cron.job where jobname = 'al-muhallab-expiry-alerts-every-2-hours'
);

-- Schedule every 2 hours (at minute 0 of hours 0, 2, 4, 6, ... UTC)
-- Replace <PROJECT_REF> with your Supabase project ref and <ANON_OR_SERVICE_KEY> with your key.
select cron.schedule(
  'al-muhallab-expiry-alerts-every-2-hours',
  '0 */2 * * *',
  $$
  select
    net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-expiry-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_OR_SERVICE_KEY>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
