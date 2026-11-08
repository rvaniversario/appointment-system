-- Firm settings, staff invites and attorney management.

-- ---------------------------------------------------------------------------
-- Staff invites: one-time links a partner or admin copies and sends themselves.
-- Only the SHA-256 of the token is stored. Server code (service role) creates and accepts
-- them; partners and admins may read their own firm's list.
-- ---------------------------------------------------------------------------
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 254),
  role public.firm_role not null,
  -- The attorney profile the new member will be linked to, if any.
  attorney_id uuid,
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  foreign key (firm_id, attorney_id) references public.attorneys (firm_id, id) on delete set null (attorney_id),
  check (expires_at > created_at)
);
-- One open invite per person per firm.
create unique index staff_invites_open_idx on public.staff_invites (firm_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon, authenticated;
grant select on public.staff_invites to authenticated;
create policy staff_invites_manager_read on public.staff_invites for select to authenticated
  using (public.is_firm_manager(firm_id));

-- ---------------------------------------------------------------------------
-- An attorney edits the public parts of their own profile. Credentials, slug, office and
-- active status stay with partners and admins (attorneys_manage policy).
-- ---------------------------------------------------------------------------
create function public.update_own_attorney_profile(
  p_bio text, p_practice_areas text[], p_languages text[], p_meeting_url text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(coalesce(p_bio, '')) > 5000
     or coalesce(array_length(p_practice_areas, 1), 0) > 20
     or coalesce(array_length(p_languages, 1), 0) > 20
     or (p_meeting_url is not null and p_meeting_url !~ '^https://') then
    raise exception 'invalid profile' using errcode = '22023';
  end if;
  update public.attorneys
    set bio = coalesce(p_bio, ''),
        practice_areas = coalesce(p_practice_areas, '{}'),
        languages = coalesce(p_languages, '{}'),
        meeting_url = p_meeting_url
    where id = public.current_attorney_id();
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.update_own_attorney_profile(text, text[], text[], text) from public, anon;
grant execute on function public.update_own_attorney_profile(text, text[], text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Firm logos: public, like attorney photos. Server code uploads them with signed URLs after
-- checking the caller is a partner or admin, so no browser role writes here directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('firm-logos', 'firm-logos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.firms
  add constraint firms_contact_email_check check (contact_email is null or length(contact_email) <= 254),
  add constraint firms_contact_phone_check check (contact_phone is null or length(contact_phone) <= 40);
