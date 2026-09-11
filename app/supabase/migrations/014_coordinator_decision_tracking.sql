-- Two gaps in the coordinator flow: (1) a provider who declines could be re-appointed
-- immediately, with no memory that she already said no; (2) "coordinator decided" had no
-- signal of its own, so the customer could jump straight to finishing the job without ever
-- having gone through naming who's accountable for it.
alter table requests add column coordinator_declined_ids uuid[] not null default '{}';
alter table requests add column coordinator_decided_at timestamptz;
