-- Indexes for columns the API filters and sorts on that had none. Every one corresponds to a
-- query shape in `api/` that was doing a sequential scan or an unindexed sort.
--
-- Paired with the N+1 batching in the same change: batching cut the NUMBER of round trips,
-- these cut the cost of each remaining one. Composite indexes are ordered (filter, sort) so a
-- single index serves both halves of the query.
--
-- NOT APPLIED AUTOMATICALLY: needs Postgres credentials (the service role key is a PostgREST
-- key, not a DB password). Run from the Supabase SQL Editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/004_perf_indexes.sql
--
-- Safe and idempotent; adding an index never changes query results.

-- chat/threads reads the latest message per thread, and lists threads newest-first.
-- `messages_thread_id_idx` is single-column, so the per-thread sort was unindexed.
create index if not exists messages_thread_created_idx on messages (thread_id, created_at desc);
create index if not exists chat_threads_created_at_idx on chat_threads (created_at desc);

-- geo.distanceMap filters on BOTH columns; only from_location_id was indexed.
create index if not exists near_distances_pair_idx
  on near_distances (from_location_id, to_location_id);

-- `bigserial` does NOT create an index, and both of these are ordered on for the
-- deterministic tiebreak that ranking depends on.
create index if not exists providers_seq_idx on providers (seq);
create index if not exists team_members_seq_idx on team_members (seq);

-- Filter-plus-sort shapes: single-column indexes existed, so the sort was unindexed.
create index if not exists requests_customer_created_idx on requests (customer_id, created_at desc);
create index if not exists ratings_provider_created_idx on ratings (provider_id, created_at desc);
create index if not exists grievances_reporter_created_idx on grievances (reporter_id, created_at desc);
