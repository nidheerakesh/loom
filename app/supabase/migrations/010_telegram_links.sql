-- Telegram gives a chat id, never a phone number — unlike WhatsApp, where Meta/Twilio have
-- already verified the sender. So a Telegram chat has to prove its phone number once (typing
-- it, matched against an existing account the same way sign-in does) before the same
-- replyFor engine (_lib/messagingEngine.ts) can be used. This table remembers that proof so
-- she isn't asked again on every message.
--
-- Telegram-only, added for the demo (WhatsApp is the real deployment) — kept apart from
-- `sessions`/`otps` rather than reusing either, since this isn't an authenticated session,
-- just a remembered mapping the bot itself maintains.
create table telegram_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chat_id text not null unique,
  phone_hash text not null
);
create index telegram_links_phone_hash_idx on telegram_links (phone_hash);

alter table telegram_links enable row level security;
