-- RLS. Service role (Edge Functions) bypasses all of this. Authenticated clients get
-- broad SELECT + owner-scoped writes. Cross-owner state changes happen via triggers.

alter table cds enable row level security;
alter table groups enable row level security;
alter table locations enable row level security;
alter table near_distances enable row level security;
alter table skills enable row level security;
alter table skill_aliases enable row level security;
alter table skill_candidates enable row level security;
alter table providers enable row level security;
alter table provider_skills enable row level security;
alter table portfolio_items enable row level security;
alter table customers enable row level security;
alter table requests enable row level security;
alter table request_skills enable row level security;
alter table interests enable row level security;
alter table matches enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table narrations enable row level security;
alter table ratings enable row level security;
alter table grievances enable row level security;
alter table chat_threads enable row level security;
alter table messages enable row level security;

-- Read-only-to-clients tables (authenticated can select; writes are service-role only)
do $$
declare t text;
begin
  foreach t in array array[
    'cds','groups','locations','near_distances','skills','skill_aliases',
    'skill_candidates','provider_skills','matches','narrations'
  ] loop
    execute format('create policy sel_%1$s on %1$s for select to authenticated using (true);', t);
  end loop;
end $$;

-- providers: public read; owner update; owner insert
create policy sel_providers on providers for select to authenticated using (true);
create policy upd_providers on providers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ins_providers on providers for insert to authenticated
  with check (user_id = auth.uid());

-- customers: public read (names shown on requests); owner update/insert
create policy sel_customers on customers for select to authenticated using (true);
create policy upd_customers on customers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ins_customers on customers for insert to authenticated
  with check (user_id = auth.uid());

-- portfolio: read all; owner insert/delete
create policy sel_portfolio on portfolio_items for select to authenticated using (true);
create policy ins_portfolio on portfolio_items for insert to authenticated
  with check (provider_id = my_provider_id());
create policy del_portfolio on portfolio_items for delete to authenticated
  using (provider_id = my_provider_id());

-- requests: read all; owner insert/update
create policy sel_requests on requests for select to authenticated using (true);
create policy ins_requests on requests for insert to authenticated
  with check (customer_id = my_customer_id());
create policy upd_requests on requests for update to authenticated
  using (customer_id = my_customer_id()) with check (customer_id = my_customer_id());

-- request_skills: read all; insert if you own the parent request
create policy sel_reqskills on request_skills for select to authenticated using (true);
create policy ins_reqskills on request_skills for insert to authenticated
  with check (exists (select 1 from requests r where r.id = request_id and r.customer_id = my_customer_id()));

-- interests: read all; provider owns own; provider updates own
create policy sel_interests on interests for select to authenticated using (true);
create policy ins_interests on interests for insert to authenticated
  with check (provider_id = my_provider_id());
create policy upd_interests on interests for update to authenticated
  using (provider_id = my_provider_id()) with check (provider_id = my_provider_id());

-- teams: read all; customer (request owner) may update (confirm)
create policy sel_teams on teams for select to authenticated using (true);
create policy upd_teams on teams for update to authenticated
  using (exists (select 1 from requests r where r.id = request_id and r.customer_id = my_customer_id()));

-- team_members: read all; provider updates own invite state
create policy sel_team_members on team_members for select to authenticated using (true);
create policy upd_team_members on team_members for update to authenticated
  using (provider_id = my_provider_id()) with check (provider_id = my_provider_id());

-- ratings: read all; customer inserts own
create policy sel_ratings on ratings for select to authenticated using (true);
create policy ins_ratings on ratings for insert to authenticated
  with check (customer_id = my_customer_id());

-- grievances: owner only
create policy sel_grievances on grievances for select to authenticated
  using (reporter_user_id = auth.uid());
create policy ins_grievances on grievances for insert to authenticated
  with check (reporter_user_id = auth.uid());

-- chat: authenticated read/insert; messages sender must be self
create policy sel_threads on chat_threads for select to authenticated using (true);
create policy ins_threads on chat_threads for insert to authenticated with check (true);
create policy sel_messages on messages for select to authenticated using (true);
create policy ins_messages on messages for insert to authenticated
  with check (sender_user_id = auth.uid());

-- ---------- triggers for cross-owner state changes ----------
create or replace function trg_interest_accept() returns trigger
language plpgsql security definer as $$
begin
  if new.state = 'accepted' then
    update requests set status = 'assigned'
    where id = new.request_id and mode = 'individual' and status = 'open';
  end if;
  return new;
end $$;
create trigger interest_accept
  after insert or update on interests
  for each row execute function trg_interest_accept();

create or replace function trg_team_confirm() returns trigger
language plpgsql security definer as $$
begin
  if new.status = 'confirmed' then
    update requests set status = 'assigned' where id = new.request_id;
  end if;
  return new;
end $$;
create trigger team_confirm
  after update on teams
  for each row execute function trg_team_confirm();
