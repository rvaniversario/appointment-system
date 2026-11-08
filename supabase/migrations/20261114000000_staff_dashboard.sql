-- Staff dashboard on real data.

-- Searches the firm's conflict records by name or matter, tolerating misspellings. Runs with
-- the caller's own permissions, so RLS limits it to their own firm's records.
create function public.search_conflict_parties(p_query text)
returns table (id uuid, name text, matter text, attorney_id uuid, similarity real)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.name, p.matter, p.attorney_id,
         greatest(extensions.similarity(lower(p.name), lower(p_query)),
                  extensions.similarity(lower(p.matter), lower(p_query))) as similarity
  from public.conflict_parties p
  where length(trim(p_query)) >= 2
    and (p.name ilike '%' || p_query || '%'
         or p.matter ilike '%' || p_query || '%'
         or extensions.similarity(lower(p.name), lower(p_query)) >= 0.3)
  order by similarity desc, p.name
  limit 50;
$$;
revoke execute on function public.search_conflict_parties(text) from public, anon;
grant execute on function public.search_conflict_parties(text) to authenticated;

create index conflict_parties_matter_trgm_idx
  on public.conflict_parties using gin (matter extensions.gin_trgm_ops);

-- Replaces an attorney's weekly hours in one step, so a failed save never leaves them with
-- none. Runs with the caller's permissions: RLS allows the attorney and their firm's
-- partners and admins.
create function public.replace_weekly_hours(p_attorney uuid, p_hours jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  -- can_manage_schedule() is null, not false, for staff of another firm.
  if not coalesce(public.can_manage_schedule(p_attorney), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.availability_rules where attorney_id = p_attorney;
  insert into public.availability_rules (attorney_id, weekday, start_time, end_time)
  select p_attorney, (h ->> 'weekday')::smallint, (h ->> 'start_time')::time, (h ->> 'end_time')::time
  from jsonb_array_elements(p_hours) as h;
end;
$$;
revoke execute on function public.replace_weekly_hours(uuid, jsonb) from public, anon;
grant execute on function public.replace_weekly_hours(uuid, jsonb) to authenticated;
