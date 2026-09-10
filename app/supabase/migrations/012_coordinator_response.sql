-- Appointing a provider as coordinator was unilateral — she was never asked, had no way to
-- decline, and requests/complete.ts would wait on her sign-off forever with no timeout and no
-- visibility into how long it had been waiting. team_members already has exactly this pattern
-- (invited/accepted/declined) for ordinary team membership; the coordinator role gets the same
-- treatment here.
alter table requests add column coordinator_response text not null default 'pending'
  check (coordinator_response in ('pending', 'accepted', 'declined'));
-- When she was appointed — not when the request was created, and not the same as
-- coordinator_signed_off_at (which is about the WORK being done, this is about whether she's
-- even agreed to be accountable for it at all). Null when coordinator_role = 'customer', since
-- she isn't "waiting" on herself.
alter table requests add column coordinator_appointed_at timestamptz;

-- Grandfather every existing row that isn't genuinely waiting on someone: the customer is
-- always implicitly "accepted" (she can't decline being accountable for her own order), and a
-- job that already has a sign-off or is already finished obviously had a coordinator who acted,
-- whether or not this column existed yet to record it.
update requests
set coordinator_response = 'accepted'
where coordinator_role = 'customer' or coordinator_signed_off_at is not null or status = 'completed';
