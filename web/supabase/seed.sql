-- Reference data (catalogue + geography). Runs on `supabase db reset`. Deterministic.
-- No fake accounts — users create their own.

insert into cds (name, panchayat) values ('Ernakulam CDS', 'Ernakulam');

insert into groups (name, cds_id)
select v.name, (select id from cds limit 1)
from (values ('SHG 1'),('SHG 2'),('SHG 3'),('SHG 4'),('SHG 5'),('SHG 6')) as v(name);

insert into locations (lat, lng, label) values
  (9.95, 76.28, 'Ernakulam'),
  (9.97, 76.30, 'Kaloor'),
  (9.99, 76.32, 'Edappally'),
  (10.01, 76.28, 'Vyttila'),
  (9.965, 76.29, 'Palarivattom'),
  (9.985, 76.31, 'Kakkanad'),
  (10.005, 76.33, 'Thrikkakara'),
  (10.025, 76.29, 'Aluva'),
  (9.98, 76.30, 'Tripunithura'),
  (10.0, 76.32, 'Fort Kochi'),
  (10.02, 76.34, 'Mattancherry'),
  (10.04, 76.30, 'Panampilly');

-- precompute NEAR distances (both directions) via haversine
insert into near_distances (from_location_id, to_location_id, distance_km)
select a.id, b.id,
  round((2 * 6371 * asin(sqrt(
    power(sin(radians((b.lat - a.lat) / 2)), 2) +
    cos(radians(a.lat)) * cos(radians(b.lat)) *
    power(sin(radians((b.lng - a.lng) / 2)), 2)
  )))::numeric, 1)
from locations a cross join locations b
where a.id <> b.id;

insert into skills (canonical_name, canonical_name_ml, icon_key) values
  ('stitching', 'തയ്യൽ', '🧵'),
  ('cutting', 'വെട്ട്', '✂️'),
  ('packaging', 'പാക്കിംഗ്', '📦'),
  ('cooking', 'പാചകം', '🍲'),
  ('craft', 'കരകൗശലം', '🎨'),
  ('tutoring', 'ട്യൂഷൻ', '📚');

insert into skill_aliases (skill_id, alias_text, source)
select s.id, a.alias, 'curated'
from skills s
join (values
  ('stitching','tailoring'),('stitching','sewing'),('stitching','garment sewing'),
  ('stitching','garment finishing'),('stitching','stitch'),('stitching','needlework'),
  ('cutting','fabric cutting'),('cutting','cloth cutting'),('cutting','cutting work'),
  ('packaging','packing'),('packaging','boxing'),('packaging','wrapping'),
  ('cooking','catering'),('cooking','cook'),('cooking','food preparation'),('cooking','culinary'),
  ('craft','handicraft'),('craft','handcraft'),('craft','artisan work'),
  ('tutoring','teaching'),('tutoring','tuition'),('tutoring','coaching')
) as a(canon, alias) on a.canon = s.canonical_name;
