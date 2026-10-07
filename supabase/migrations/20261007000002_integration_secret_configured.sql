-- Gateways such as Cakto need the webhook URL first and only then reveal their secret. An integration can
-- therefore exist before its secret is known. While secret_configured = false, deliveries are rejected.
alter table public.integrations add column secret_configured boolean not null default true;

grant select (secret_configured) on public.integrations to authenticated;
