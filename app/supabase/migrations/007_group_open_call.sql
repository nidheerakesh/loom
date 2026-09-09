-- Group orders move from auto-assembly to an open call: the customer states how many people
-- she wants and by when, every provider who can do the work sees it and expresses interest,
-- and she picks who she wants once the window closes. Two new columns on requests carry that —
-- both null for individual requests and for group requests created before this migration, which
-- keeps behaving exactly as before (no headcount cap, no deadline to enforce).
--
-- team_assembly's auto-matching engine (assemble.ts and friends) is untouched and still works;
-- it is simply no longer the customer-facing default for a new group order.
alter table requests add column headcount integer;
alter table requests add column interest_deadline timestamptz;

alter table requests add constraint requests_headcount_positive check (headcount is null or headcount > 0);
