-- Client portal on real data.

-- How close to the start a client may still cancel or reschedule online. Firm settings
-- (Phase 5c) make this editable; until then every firm uses the default.
alter table public.firms add column cancellation_cutoff_hours smallint not null default 24
  check (cancellation_cutoff_hours between 0 and 336);

-- When the booking was first confirmed. Holds and unpaid checkouts never get one, so the
-- portal can list real bookings, including canceled ones, without abandoned attempts.
alter table public.appointments add column confirmed_at timestamptz;
update public.appointments set confirmed_at = created_at
  where status in ('confirmed', 'completed', 'no_show');

create function public.set_confirmed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  return new;
end;
$$;
create trigger appointments_confirmed_at before insert or update of status on public.appointments
  for each row execute function public.set_confirmed_at();

create index appointments_client_confirmed_idx on public.appointments (client_id, starts_at)
  where confirmed_at is not null;

-- Marks the other side's messages in a thread as read. There's no update policy on messages,
-- so this is the only way read_at changes, and it can't touch the message body.
create function public.mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_thread(p_thread) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.messages
    set read_at = now()
    where thread_id = p_thread and sender_id <> auth.uid() and read_at is null;
end;
$$;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;
