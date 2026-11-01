-- LOCAL DEVELOPMENT SEED ONLY. Loaded by `supabase db reset`; never run against production.
-- All people, roll numbers and matters below are fictional sample data.

insert into public.offices (id, name, address, is_remote) values
  ('00000000-0000-4000-a000-000000000001', 'Makati Office', 'Ayala Avenue, Makati City, Metro Manila', false),
  ('00000000-0000-4000-a000-000000000002', 'Quezon City Office', 'Eastwood Avenue, Quezon City, Metro Manila', false),
  ('00000000-0000-4000-a000-000000000003', 'Remote / Video only', '', true);

insert into public.consult_types (slug, label, description, mode, duration_minutes, price_centavos, sort_order) values
  ('free-phone', 'Free 15-min Phone Screening', 'Quick call to see if we can help', 'phone', 15, 0, 1),
  ('video-30', '30-min Video Consultation', 'In-depth discussion over video', 'video', 30, 150000, 2),
  ('inperson-60', '60-min In-Person Consultation', 'Meet at one of our offices', 'in_person', 60, 350000, 3);

insert into public.attorneys (id, slug, full_name, ibp_roll_no, admitted_year, practice_areas, languages, office_id, bio, meeting_url) values
  ('00000000-0000-4000-b000-000000000001', 'maria-chen', 'Maria Chen', '00001-SAMPLE', 2011,
   '{Family Law,Estate Planning}', '{English,Filipino,Mandarin}', '00000000-0000-4000-a000-000000000001',
   'Maria focuses on annulment, custody, and estate planning matters, helping clients navigate difficult family transitions with a steady, practical approach.',
   'https://meet.google.com/sample-chen'),
  ('00000000-0000-4000-b000-000000000002', 'david-okafor', 'David Okafor', '00002-SAMPLE', 2008,
   '{Criminal Defense}', '{English,Filipino}', '00000000-0000-4000-a000-000000000002',
   'David represents clients facing criminal charges, with a focus on clear communication under pressure.',
   'https://meet.google.com/sample-okafor'),
  ('00000000-0000-4000-b000-000000000003', 'sofia-ramirez', 'Sofia Ramirez', '00003-SAMPLE', 2015,
   '{Immigration,Family Law}', '{English,Filipino,Spanish}', '00000000-0000-4000-a000-000000000001',
   'Sofia helps individuals and families with visas and immigration matters, alongside related family law issues.',
   'https://meet.google.com/sample-ramirez'),
  ('00000000-0000-4000-b000-000000000004', 'james-whitfield', 'James Whitfield', '00004-SAMPLE', 2009,
   '{Business Law,Civil Litigation}', '{English}', '00000000-0000-4000-a000-000000000002',
   'James advises businesses on contracts, corporate matters, and commercial disputes.',
   'https://meet.google.com/sample-whitfield'),
  ('00000000-0000-4000-b000-000000000005', 'priya-anand', 'Priya Anand', '00005-SAMPLE', 2013,
   '{Estate Planning,Civil Litigation}', '{English,Filipino}', '00000000-0000-4000-a000-000000000002',
   'Priya builds wills and estate plans tailored to each family, and handles related settlement of estate disputes.',
   'https://meet.google.com/sample-anand'),
  ('00000000-0000-4000-b000-000000000006', 'tom-reilly', 'Tom Reilly', '00006-SAMPLE', 2010,
   '{Criminal Defense,Civil Litigation}', '{English,Filipino}', '00000000-0000-4000-a000-000000000003',
   'Tom practices entirely over secure video, giving clients flexible access to counsel from anywhere in the country.',
   'https://meet.google.com/sample-reilly');

-- Weekday hours (Asia/Manila): mornings and afternoons, Mon–Fri; Reilly also Saturday mornings.
insert into public.availability_rules (attorney_id, weekday, start_time, end_time)
select a.id, d.weekday, t.start_time, t.end_time
from public.attorneys a
cross join (values (1), (2), (3), (4), (5)) as d(weekday)
cross join (values (time '09:00', time '12:00'), (time '13:00', time '17:00')) as t(start_time, end_time);

insert into public.availability_rules (attorney_id, weekday, start_time, end_time) values
  ('00000000-0000-4000-b000-000000000006', 6, '09:00', '12:00');

insert into public.conflict_parties (name, matter, attorney_id) values
  ('Amara Smith', 'Smith v. Whitfield Holdings — breach of contract', '00000000-0000-4000-b000-000000000004'),
  ('Daniel Ortiz', 'Ortiz Family — settlement of estate', '00000000-0000-4000-b000-000000000005'),
  ('Priya Nair', 'Nair v. Reilly Construction — civil claim', '00000000-0000-4000-b000-000000000006'),
  ('Kevin Park', 'People v. Park — criminal defense', '00000000-0000-4000-b000-000000000002');
